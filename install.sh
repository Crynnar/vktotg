#!/bin/bash

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Функции для вывода
print_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
print_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }
print_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

clear
echo "============================================="
echo "   Установка VK to Telegram бота как сервис"
echo "============================================="
echo ""

# Определяем пользователя и домашнюю директорию
USER_NAME=$(whoami)
USER_HOME=$HOME
SERVICE_NAME="vktotg-bot"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
PROJECT_DIR="${USER_HOME}/vktotg-bot"

# 1. Проверка и установка Node.js
print_step "1. Проверка Node.js..."
if ! command -v node &> /dev/null; then
    print_warn "Node.js не найден. Устанавливаем..."
    
    # Определяем ОС
    if [ -f /etc/debian_version ]; then
        # Debian/Ubuntu
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt install -y nodejs
    elif [ -f /etc/redhat-release ]; then
        # CentOS/RHEL
        curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
        sudo yum install -y nodejs
    else
        print_error "Неизвестная ОС. Установите Node.js вручную: https://nodejs.org"
        exit 1
    fi
else
    print_info "Node.js уже установлен: $(node --version)"
fi

# 2. Проверка npm
print_step "2. Проверка npm..."
if ! command -v npm &> /dev/null; then
    print_error "npm не найден. Установите Node.js полностью."
    exit 1
else
    print_info "npm уже установлен: $(npm --version)"
fi

# 3. Проверка git (опционально)
print_step "3. Проверка git..."
if ! command -v git &> /dev/null; then
    print_warn "Git не найден. Будет использована прямая загрузка."
    GIT_AVAILABLE=false
else
    print_info "Git найден: $(git --version)"
    GIT_AVAILABLE=true
fi

# 4. Создание директории проекта
print_step "4. Создание директории проекта..."
if [ -d "$PROJECT_DIR" ]; then
    print_warn "Директория $PROJECT_DIR уже существует."
    read -p "Перезаписать? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$PROJECT_DIR"
        mkdir -p "$PROJECT_DIR"
        print_info "Директория очищена"
    else
        print_info "Используем существующую директорию"
    fi
else
    mkdir -p "$PROJECT_DIR"
    print_info "Директория создана: $PROJECT_DIR"
fi

cd "$PROJECT_DIR"

# 5. Загрузка кода
print_step "5. Загрузка кода бота..."
if [ "$GIT_AVAILABLE" = true ]; then
    git clone https://github.com/Crynnar/vktotg.git .
else
    # Скачиваем архив с GitHub
    curl -L https://github.com/Crynnar/vktotg/archive/refs/tags/v.0.0.2.tar.gz -o vktotg.tar.gz
    tar -xzf vktotg.tar.gz --strip-components=1
    rm vktotg.tar.gz
fi

# 6. Установка зависимостей
print_step "6. Установка зависимостей..."
npm install

# 7. Установка PM2 глобально
print_step "7. Установка PM2 для управления процессами..."
npm install -g pm2

# 8. Создание файла конфигурации
print_step "8. Настройка конфигурации..."

# Проверяем наличие примера конфига
if [ -f "config.example.js" ]; then
    cp config.example.js config.js
    print_info "Создан config.js из примера"
elif [ -f ".env.example" ]; then
    cp .env.example .env
    print_info "Создан .env из примера"
else
    # Создаем базовый config.js
    cat > config.js << 'EOF'
module.exports = {
    vk: {
        domain: 'theantgames',
        triggerText: 'Код набора на этой неделе:',
        checkInterval: 30000,
        accessToken: 'ВАШ_VK_ТОКЕН',
        apiVersion: '5.131'
    },
    tg: {
        token: 'ВАШ_TELEGRAM_TOKEN',
        chatId: 'ВАШ_ID_БЕСЕДЫ'
    }
};
EOF
    print_info "Создан базовый config.js"
fi

# 9. Настройка PM2
print_step "9. Настройка PM2..."
pm2 start bot.js --name "$SERVICE_NAME" --node-args="--max-old-space-size=512"
pm2 save
pm2 startup | tail -n 1 > pm2_startup_command.txt
STARTUP_CMD=$(cat pm2_startup_command.txt)

# 10. Создание systemd сервиса
print_step "10. Создание systemd сервиса..."

# Создаем временный файл сервиса
cat > /tmp/${SERVICE_NAME}.service << EOF
[Unit]
Description=VK to Telegram Bot Service
After=network.target
Wants=network.target

[Service]
Type=simple
User=$USER_NAME
Group=$USER_NAME
WorkingDirectory=$PROJECT_DIR
Environment=NODE_ENV=production
Environment=PATH=/usr/bin:/usr/local/bin
ExecStart=/usr/bin/pm2 start $SERVICE_NAME --no-daemon
ExecReload=/usr/bin/pm2 reload $SERVICE_NAME
ExecStop=/usr/bin/pm2 stop $SERVICE_NAME
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Копируем сервис в systemd
sudo cp /tmp/${SERVICE_NAME}.service $SERVICE_FILE
rm /tmp/${SERVICE_NAME}.service

# Перезагружаем systemd
sudo systemctl daemon-reload

# 11. Создание скриптов управления
print_step "11. Создание скриптов управления..."

# Скрипт для просмотра логов
cat > "$PROJECT_DIR/logs.sh" << 'EOF'
#!/bin/bash
pm2 logs vktotg-bot
EOF

# Скрипт для перезапуска
cat > "$PROJECT_DIR/restart.sh" << 'EOF'
#!/bin/bash
pm2 restart vktotg-bot
EOF

# Скрипт для остановки
cat > "$PROJECT_DIR/stop.sh" << 'EOF'
#!/bin/bash
pm2 stop vktotg-bot
EOF

# Скрипт для статуса
cat > "$PROJECT_DIR/status.sh" << 'EOF'
#!/bin/bash
pm2 status vktotg-bot
EOF

# Скрипт мониторинга памяти
cat > "$PROJECT_DIR/monitor.sh" << 'EOF'
#!/bin/bash
while true; do
    clear
    echo "📊 Мониторинг памяти бота"
    echo "=========================="
    pm2 show vktotg-bot | grep "memory"
    echo ""
    echo "Нажмите Ctrl+C для выхода"
    sleep 5
done
EOF

# Делаем скрипты исполняемыми
chmod +x "$PROJECT_DIR"/*.sh

# 12. Создание README с инструкциями
print_step "12. Создание инструкции..."

cat > "$PROJECT_DIR/README.md" << EOF
# VK to Telegram Bot

## 📋 Настройка

1. **Отредактируйте конфигурацию:**
   \`\`\`bash
   nano $PROJECT_DIR/config.js
   \`\`\`
   
   Укажите:
   - VK токен (получить на https://vkhost.github.io/)
   - Telegram токен (от @BotFather)
   - ID беседы (узнать у @userinfobot)

## 🚀 Управление сервисом

### Через systemd:
\`\`\`bash
# Запуск
sudo systemctl start $SERVICE_NAME

# Остановка
sudo systemctl stop $SERVICE_NAME

# Перезапуск
sudo systemctl restart $SERVICE_NAME

# Статус
sudo systemctl status $SERVICE_NAME

# Автозагрузка
sudo systemctl enable $SERVICE_NAME

# Просмотр логов
sudo journalctl -u $SERVICE_NAME -f
\`\`\`

### Через PM2:
\`\`\`bash
# Статус
pm2 status $SERVICE_NAME

# Логи
pm2 logs $SERVICE_NAME

# Мониторинг
pm2 monit

# Перезапуск
pm2 restart $SERVICE_NAME
\`\`\`

### Скрипты в папке проекта:
\`\`\`bash
./logs.sh     # Просмотр логов
./status.sh   # Статус бота
./restart.sh  # Перезапуск
./stop.sh     # Остановка
./monitor.sh  # Мониторинг памяти
\`\`\`

## 📊 Мониторинг

\`\`\`bash
# Проверка памяти
pm2 show $SERVICE_NAME | grep memory

# Метрики
pm2 prettylist | grep -A 10 "monit"

# Все процессы
pm2 status
\`\`\`

## 🔧 Устранение проблем

Если бот не запускается:
\`\`\`bash
# Проверить логи
sudo journalctl -u $SERVICE_NAME -f

# Проверить конфигурацию
node -e "console.log(require('./config.js'))"

# Проверить токены
curl -X POST https://api.telegram.org/bot<ТОКЕН>/getMe
\`\`\`
EOF

# 13. Финальные шаги
print_step "13. Завершение установки..."

# Включаем и запускаем сервис
sudo systemctl enable $SERVICE_NAME
sudo systemctl start $SERVICE_NAME

# Проверяем статус
sleep 2
SERVICE_STATUS=$(sudo systemctl is-active $SERVICE_NAME)

echo ""
echo "============================================="
echo "✅ УСТАНОВКА ЗАВЕРШЕНА"
echo "============================================="
echo ""

if [ "$SERVICE_STATUS" = "active" ]; then
    print_info "✅ Сервис успешно запущен!"
else
    print_warn "⚠️ Сервис не запустился. Проверьте конфигурацию."
fi

echo ""
print_info "📁 Проект установлен в: $PROJECT_DIR"
echo ""
print_info "🔧 Следующие шаги:"
echo "1. Отредактируйте конфигурацию:"
echo "   nano $PROJECT_DIR/config.js"
echo ""
echo "2. После редактирования перезапустите сервис:"
echo "   sudo systemctl restart $SERVICE_NAME"
echo ""
print_info "📊 Полезные команды:"
echo "  • Статус:    sudo systemctl status $SERVICE_NAME"
echo "  • Логи:      sudo journalctl -u $SERVICE_NAME -f"
echo "  • PM2 монитор: pm2 monit"
echo "  • Свои скрипты: cd $PROJECT_DIR && ./logs.sh"
echo ""
print_info "📝 Полная инструкция: cat $PROJECT_DIR/README.md"
echo ""
echo "============================================="
