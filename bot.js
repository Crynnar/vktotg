const axios = require('axios');
const { Telegraf } = require('telegraf');
const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

// ==================== КОНФИГУРАЦИЯ ====================
const CONFIG = {
    vk: {
        domain: 'theantgames', // Имя группы VK
        triggerText: 'Код набора на этой неделе:', // Текст для поиска
        checkInterval: 60000, // 30 секунд
        accessToken: '', // Вставьте ваш VK токен
        apiVersion: '5.131'
    },
    tg: {
        token: '', // Токен бота от @BotFather
        chatId: '' // ID беседы (обычно с минусом: -1001234567890)
    }
};

// ==================== ПУТИ К ФАЙЛАМ ====================
const STATE_FILE = path.join(__dirname, 'last_post_id.txt');
const LOG_FILE = path.join(__dirname, 'bot.log');
const CODES_FILE = path.join(__dirname, 'found_codes.txt');

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
const tg = new Telegraf(CONFIG.tg.token);

// ==================== БУФЕРИЗИРОВАННОЕ ЛОГИРОВАНИЕ ====================
class Logger {
    constructor(filename) {
        this.filename = filename;
        this.buffer = [];
        this.flushInterval = setInterval(() => this.flush(), 5000);
    }

    async log(message) {
        const timestamp = new Date().toLocaleString('ru-RU', { 
            timeZone: 'Europe/Moscow',
            hour12: false 
        });
        const logMessage = `[${timestamp}] ${message}`;
        
        console.log(logMessage);
        
        // Добавляем в буфер вместо немедленной записи
        this.buffer.push(logMessage + '\n');
        
        // Если буфер большой, сбрасываем
        if (this.buffer.length > 100) {
            await this.flush();
        }
    }

    async flush() {
        if (this.buffer.length === 0) return;
        
        try {
            const data = this.buffer.join('');
            this.buffer = [];
            await fs.appendFile(this.filename, data, 'utf8');
        } catch (error) {
            console.error('Ошибка записи лога:', error.message);
        }
    }

    async close() {
        clearInterval(this.flushInterval);
        await this.flush();
    }
}

const logger = new Logger(LOG_FILE);

// ==================== ФУНКЦИИ РАБОТЫ С ФАЙЛАМИ ====================
async function loadLastPostId() {
    try {
        const data = await fs.readFile(STATE_FILE, 'utf8');
        return parseInt(data, 10);
    } catch {
        return null;
    }
}

async function saveLastPostId(id) {
    try {
        await fs.writeFile(STATE_FILE, id.toString(), 'utf8');
        await logger.log(`💾 Сохранен последний ID: ${id}`);
    } catch (error) {
        await logger.log(`❌ Ошибка сохранения ID: ${error.message}`);
    }
}

async function saveFoundCode(code, postLink) {
    try {
        const timestamp = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
        const entry = `[${timestamp}] Код: ${code} | Ссылка: ${postLink}\n`;
        await fs.appendFile(CODES_FILE, entry, 'utf8');
    } catch (error) {
        await logger.log(`❌ Ошибка сохранения кода: ${error.message}`);
    }
}

// ==================== ФУНКЦИЯ ПОЛУЧЕНИЯ ПОСТОВ VK ====================
async function getVKPosts() {
    try {
        if (!CONFIG.vk.accessToken || CONFIG.vk.accessToken === 'ВАШ_VK_ТОКЕН') {
            await logger.log('❌ VK токен не настроен!');
            return [];
        }

        const response = await axios.get('https://api.vk.com/method/wall.get', {
            params: {
                domain: CONFIG.vk.domain,
                count: 2, // Уменьшили с 10 до 5 для экономии памяти
                v: CONFIG.vk.apiVersion,
                access_token: CONFIG.vk.accessToken
            },
            timeout: 10000
        });
        
        if (response.data.error) {
            await logger.log(`❌ Ошибка VK API: ${response.data.error.error_msg}`);
            return [];
        }
        
        // Очищаем response для экономии памяти
        const items = response.data.response?.items || [];
        response.data = null; // Помогаем сборщику мусора
        
        return items;
    } catch (error) {
        await logger.log(`❌ Ошибка получения постов VK: ${error.message}`);
        return [];
    }
}

// ==================== ФУНКЦИЯ ИЗВЛЕЧЕНИЯ КОДА ====================
function extractCode(postText, debug = false) {
    if (!postText) return null;
    
    // Простая очистка без лишних переменных
    const cleanText = postText.replace(/\s+/g, ' ').trim();
    
    // Паттерны поиска (объединили для экономии памяти)
    const patterns = [
        { pattern: /\b[A-Z0-9]{10}\b/g, priority: 1 },
        { pattern: new RegExp(`${CONFIG.vk.triggerText}\\s*([A-Z0-9]{8,12})`, 'i'), priority: 2 },
        { pattern: /["'([{]([A-Z0-9]{8,12})["')}\]]/g, priority: 3 },
        { pattern: /(?:код|code)[:\s]*([A-Z0-9]{8,12})/gi, priority: 4 },
        { pattern: /\b[A-Z0-9]{8,12}\b/g, priority: 5 }
    ];
    
    let bestMatch = null;
    let bestPriority = Infinity;
    
    for (const { pattern, priority } of patterns) {
        let matches = [];
        let match;
        
        if (pattern.global) pattern.lastIndex = 0;
        
        while ((match = pattern.exec(cleanText)) !== null) {
            const code = match[1] || match[0];
            const cleanCode = code.replace(/[^A-Z0-9]/g, '');
            
            if (/^[A-Z0-9]{8,12}$/.test(cleanCode)) {
                matches.push(cleanCode);
            }
        }
        
        if (matches.length > 0 && priority < bestPriority) {
            bestMatch = matches[0];
            bestPriority = priority;
        }
        
        // Очищаем matches для экономии памяти
        matches = null;
    }
    
    return bestMatch;
}

// ==================== ФУНКЦИЯ ОТПРАВКИ В БЕСЕДУ ====================
async function sendCodeToTelegram(code, postLink) {
    const message = `🎮 **Новый код для The Ants!**\n\n` +
                    `📋 **Код:** \`${code}\`\n\n` +
                    `🔗 [Пост с кодом](${postLink})\n\n` +
                    `⚡️ **Активируй на** [официальном сайте](https://the-ants.com)`;
    
    try {
        await tg.telegram.sendMessage(CONFIG.tg.chatId, message, {
            parse_mode: 'Markdown',
            disable_web_page_preview: false
        });
        await logger.log(`✅ Код ${code} отправлен в беседу`);
        return true;
    } catch (error) {
        await logger.log(`❌ Ошибка отправки в беседу: ${error.message}`);
        
        // Пробуем без Markdown
        if (error.description?.includes('parse')) {
            try {
                const plainMessage = `🎮 Новый код для The Ants!\n\n📋 Код: ${code}\n\n🔗 Ссылка: ${postLink}\n\n⚡️ Активируй на официальном сайте https://the-ants.com`;
                await tg.telegram.sendMessage(CONFIG.tg.chatId, plainMessage);
                await logger.log(`✅ Код ${code} отправлен в беседу (без форматирования)`);
                return true;
            } catch (e) {
                await logger.log(`❌ Ошибка отправки в беседу (повторная): ${e.message}`);
            }
        }
        return false;
    }
}

// ==================== ФУНКЦИЯ ПРОВЕРКИ НОВЫХ ПОСТОВ ====================
async function checkNewPosts() {
    try {
        await logger.log('🔍 Проверка новых постов...');
        
        const posts = await getVKPosts();
        if (posts.length === 0) {
            await logger.log('⚠️ Не удалось получить посты');
            return;
        }
        
        const lastProcessedId = await loadLastPostId();
        const newPosts = [];
        
        // Ищем новые посты
        for (const post of posts) {
            if (!lastProcessedId || post.id > lastProcessedId) {
                newPosts.push(post);
            } else {
                break;
            }
        }
        
        if (newPosts.length === 0) {
            await logger.log('⏳ Новых постов нет');
            return;
        }
        
        await logger.log(`📝 Найдено ${newPosts.length} новых постов`);
        
        // Обрабатываем от старых к новым
        newPosts.reverse();
        
        for (const post of newPosts) {
            if (post.text && post.text.includes(CONFIG.vk.triggerText)) {
                await logger.log(`🔍 Найден пост с триггером: ${post.id}`);
                
                const code = extractCode(post.text);
                
                if (code) {
                    const postLink = `https://vk.com/${CONFIG.vk.domain}?w=wall${post.owner_id}_${post.id}`;
                    await sendCodeToTelegram(code, postLink);
                    await saveFoundCode(code, postLink);
                    await logger.log(`✅ Код ${code} успешно обработан`);
                } else {
                    await logger.log(`⚠️ Код не найден в посте ${post.id}`);
                }
            }
            
            // Очищаем post для экономии памяти
            post.text = null;
            post.attachments = null;
            
            // Небольшая задержка
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Сохраняем ID самого нового поста
        if (posts[0]?.id) {
            await saveLastPostId(posts[0].id);
        }
        
        // Очищаем массивы
        posts.length = 0;
        newPosts.length = 0;
        
        // Принудительный сбор мусора (если запущено с флагом --expose-gc)
        if (global.gc) {
            global.gc();
        }
        
    } catch (error) {
        await logger.log(`❌ Критическая ошибка: ${error.message}`);
    }
}

// ==================== ФУНКЦИИ ДЕБАГА ====================
function analyzePost(postText) {
    console.log('\n' + '🔍 АНАЛИЗ ПОСТА');
    console.log('─'.repeat(60));
    
    const hasTrigger = postText.includes(CONFIG.vk.triggerText);
    console.log(`🔎 Триггер найден: ${hasTrigger ? '✅' : '❌'}`);
    
    const code = extractCode(postText);
    console.log(`🎯 Код: ${code || '❌ не найден'}`);
    
    if (hasTrigger && code) {
        console.log('✅ Пост подходит для отправки!');
    } else {
        console.log('❌ Пост НЕ будет отправлен');
    }
    
    console.log('─'.repeat(60));
}

async function debugMode() {
    console.log('\n🔧 РЕЖИМ ДЕБАГА');
    console.log('📝 Введите текст поста (или "exit"):\n');
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    const askForPost = () => {
        rl.question('👉 ', (postText) => {
            if (postText.toLowerCase() === 'exit') {
                rl.close();
                return;
            }
            
            analyzePost(postText);
            console.log('\n' + '='.repeat(60) + '\n');
            askForPost();
        });
    };
    
    askForPost();
}

// ==================== ЗАПУСК ====================
async function startBot() {
    const args = process.argv.slice(2);
    
    if (args.includes('--debug') || args.includes('-d')) {
        await debugMode();
    } 
    else if (args.includes('--help') || args.includes('-h')) {
        console.log('\n📚 ИСПОЛЬЗОВАНИЕ:');
        console.log('node bot.js          - Запуск бота');
        console.log('node bot.js --debug  - Режим дебага');
        console.log('node bot.js -d       - То же');
        console.log('node bot.js --help   - Справка');
    }
    else {
        console.log('\n' + '='.repeat(60));
        console.log('🚀 БОТ ЗАПУЩЕН');
        console.log('='.repeat(60));
        
        await logger.log('🚀 Бот запущен!');
        await logger.log(`📊 Группа: ${CONFIG.vk.domain}`);
            
        // Первая проверка
        await checkNewPosts();
        
        // Периодическая проверка
        const interval = setInterval(checkNewPosts, CONFIG.vk.checkInterval);
        
        // Обработка остановки
        process.on('SIGINT', async () => {
            clearInterval(interval);
            await logger.log('👋 Бот остановлен');
            await logger.close();
            process.exit(0);
        });
        
        process.on('SIGTERM', async () => {
            clearInterval(interval);
            await logger.log('👋 Бот остановлен (SIGTERM)');
            await logger.close();
            process.exit(0);
        });
        
        // Периодический сбор мусора (каждый час)
        setInterval(() => {
            if (global.gc) {
                global.gc();
                logger.log('🧹 Принудительный сбор мусора');
            }
        }, 3600000);
    }
}

// ==================== ТОЧКА ВХОДА ====================
if (require.main === module) {
    // Проверка конфигурации
    let configOk = true;
    
    if (CONFIG.tg.token === 'ВАШ_TELEGRAM_TOKEN') {
        console.log('⚠️ Не настроен Telegram токен!');
        configOk = false;
    }
    
    if (CONFIG.tg.chatId === 'ВАШ_ID_БЕСЕДЫ') {
        console.log('⚠️ Не настроен ID беседы!');
        configOk = false;
    }
    
    if (CONFIG.vk.accessToken === 'ВАШ_VK_ТОКЕН') {
        console.log('⚠️ Не настроен VK токен!');
        configOk = false;
    }
    
    if (!configOk) {
        console.log('\n📝 Настройте config и запустите снова');
        console.log('💡 Используйте: node bot.js --debug для теста без токенов');
        
        if (process.argv.includes('--debug') || process.argv.includes('-d')) {
            startBot();
        } else {
            process.exit(1);
        }
    } else {
        startBot();
    }
}

module.exports = { extractCode, analyzePost };
