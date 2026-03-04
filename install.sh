#!/bin/bash

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Функция для вывода с цветом
print_message() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Проверка прав
if [ "$EUID" -eq 0 ]; then 
    print_error "Не запускайте скрипт от root!"
    exit 1
fi

print_message "==================================="
print_message "Установка бота VK to Telegram"
print_message "==================================="
echo ""

# 1. Проверка и установка Node.js
print_message "Проверка Node.js..."
if ! command -v node &> /dev/null; then
    print_warning "Node.js не найден. Устанавливаем..."
    
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
    print_message "Node.js уже установлен: $(node --version)"
fi

# 2. Проверка npm
print_message "Проверка npm..."
if ! command -v npm &> /dev/null; then
    print_error "npm не найден. Установите Node.js полностью."
    exit 1
else
    print_message "npm уже установлен: $(npm --version)"
fi

# 3. Создание директории проекта
PROJECT_DIR="$HOME/vktotg-bot"
print_message "Создание директории проекта: $PROJECT_DIR"
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

# 4. Клонирование или загрузка кода
print_message "Загрузка кода бота..."
if [ -d ".git" ]; then
    git pull
else
    # Если есть git, клонируем репозиторий
    if command -v git &> /dev/null; then
        git clone https://github.com/Crynnar/vktotg.git .
    else
        print_warning "Git не найден. Скачиваем вручную..."
        # Скачиваем архив с релиза
        curl -L https://github.com/Crynnar/vktotg/archive/refs/tags/test.tar.gz -o vktotg.tar.gz
        tar -xzf vktotg.tar.gz --strip-components=1
        rm vktotg.tar.gz
    fi
fi

# 5. Установка зависимостей
print_message "Установка зависимостей..."
npm install

# 6. Создание файла конфигурации из примера
print_message "Настройка конфигурации..."
if [ -f "config.example.js" ]; then
    cp config.example.js config.js
    print_message "Создан config.js. Отредактируйте его перед запуском."
elif [ -f ".env.example" ]; then
    cp .env.example .env
    print_message "Создан .env. Отредактируйте его перед запуском."
else
    print_warning "Файл примера конфигурации не найден."
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
    print_message "Создан базовый config.js"
fi

# 7. Создание скрипта запуска
print_message "Создание скрипта запуска..."
cat > start.sh << 'EOF'
#!/bin/bash
export NODE_OPTIONS="--max-old-space-size=512"
node bot.js
EOF

chmod +x start.sh

# 8. Создание systemd сервиса (опционально)
print_message "Настройка автозапуска..."
read -p "Установить автозапуск через systemd? (y/n): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    SERVICE_NAME="vktotg-bot"
    SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
    
    sudo bash -c "cat > $SERVICE_FILE" << EOF
[Unit]
Description=VK to Telegram Bot
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR
ExecStart=/usr/bin/node --max-old-space-size=512 $PROJECT_DIR/bot.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable $SERVICE_NAME
    print_message "Сервис $SERVICE_NAME создан и добавлен в автозагрузку"
    print_message "Запуск: sudo systemctl start $SERVICE_NAME"
    print_message "Логи: sudo journalctl -u $SERVICE_NAME -f"
fi

# 9. Финальные сообщения
print_message "==================================="
print_message "Установка завершена!"
print_message "==================================="
echo ""
print_message "📁 Директория проекта: $PROJECT_DIR"
print_message "⚙️  Файл конфигурации: $PROJECT_DIR/config.js"
print_message "▶️  Запуск бота: ./start.sh"
print_message "📋 Просмотр логов: tail -f bot.log"
echo ""
print_warning "⚠️  НЕ ЗАБУДЬТЕ:"
print_warning "1. Отредактировать config.js - указать токены"
print_warning "2. Получить VK токен (см. инструкцию)"
print_warning "3. Узнать ID беседы Telegram"
echo ""
print_message "Инструкция по настройке:"
print_message "1. VK токен: https://vkhost.github.io/"
print_message "2. Telegram: @BotFather -> создать бота"
print_message "3. ID чата: @userinfobot"
echo ""
print_message "Готово! 🚀"
