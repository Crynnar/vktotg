// index.js
const CONFIG = require('./config');
const Logger = require('./logger');
const VKClient = require('./vk');
const TelegramClient = require('./telegram');
const { startDebug } = require('./debug');

// Инициализация
const logger = new Logger(CONFIG.files.log);
const vk = new VKClient(CONFIG, logger);
const tg = new TelegramClient(CONFIG, logger);

// Проверка новых постов
async function checkNewPosts() {
    await logger.log('🔍 Проверка...');
    
    const posts = await vk.getPosts();
    if (posts.length === 0) return;
    
    const lastId = await vk.loadLastId();
    const newPosts = posts.filter(p => !lastId || p.id > lastId);
    
    if (newPosts.length === 0) {
        await logger.log('⏳ Новых нет');
        return;
    }
    
    await logger.log(`📝 Найдено: ${newPosts.length}`);
    
    // Обрабатываем от старых к новым
    newPosts.reverse();
    
    for (const post of newPosts) {
        if (vk.hasTrigger(post.text)) {
            await logger.log(`🔍 Пост ${post.id} с триггером`);
            
            const code = vk.extractCode(post.text);
            if (code) {
                await tg.sendCode(code, vk.getPostLink(post));
            } else {
                await logger.log(`⚠️ Код не найден`);
            }
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    
    if (posts[0]?.id) {
        await vk.saveLastId(posts[0].id);
    }
}

// Запуск
async function start() {
    const args = process.argv.slice(2);
    
    if (args.includes('--debug') || args.includes('-d')) {
        startDebug(CONFIG.vk.triggerText, (text) => vk.extractCode(text));
        return;
    }
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log('\n📚 ИСПОЛЬЗОВАНИЕ:');
        console.log('node index.js        - Запуск бота');
        console.log('node index.js --debug - Режим дебага');
        console.log('node index.js --help  - Справка');
        return;
    }
    
    console.log('\n' + '='.repeat(40));
    console.log('🚀 БОТ ЗАПУЩЕН');
    console.log('='.repeat(40));
    
    await logger.log('🚀 Бот запущен');
    
    // Тест Telegram
    const tgOk = await tg.test();
    await logger.log(tgOk ? '✅ Telegram OK' : '⚠️ Telegram ошибка');
    
    // Первая проверка
    await checkNewPosts();
    
    // Периодическая проверка
    const interval = setInterval(checkNewPosts, CONFIG.vk.checkInterval);
    
    // Обработка остановки
    const shutdown = async () => {
        clearInterval(interval);
        await logger.log('👋 Бот остановлен');
        await logger.close();
        process.exit(0);
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

// Проверка конфигурации
function checkConfig() {
    if (CONFIG.tg.token === 'ВАШ_TELEGRAM_TOKEN') return false;
    if (CONFIG.tg.chatId === 'ВАШ_ID_БЕСЕДЫ') return false;
    if (CONFIG.vk.accessToken === 'ВАШ_VK_ТОКЕН') return false;
    return true;
}

// Точка входа
if (require.main === module) {
    if (!checkConfig() && !process.argv.includes('--debug')) {
        console.log('\n⚠️ Настройте config.js');
        console.log('Используйте: node index.js --debug для теста\n');
        process.exit(1);
    }
    start();
}
