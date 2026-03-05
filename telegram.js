// telegram.js
const { Telegraf } = require('telegraf');
const fs = require('fs').promises;
const path = require('path');

class TelegramClient {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.bot = new Telegraf(config.tg.token);
        this.codesFile = path.join(__dirname, config.files.codes);
    }

    async sendCode(code, postLink) {
        const message = `🎮 **Новый код!**\n\n📋 **Код:** \`${code}\`\n\n🔗 [Пост](${postLink})`;
        
        try {
            await this.bot.telegram.sendMessage(this.config.tg.chatId, message, {
                parse_mode: 'Markdown'
            });
            await this.logger.log(`✅ Код ${code} отправлен`);
            await this.saveCode(code, postLink);
            return true;
        } catch (error) {
            await this.logger.log(`❌ Ошибка: ${error.message}`);
            return false;
        }
    }

    async saveCode(code, link) {
        try {
            const timestamp = new Date().toLocaleString('ru-RU');
            await fs.appendFile(this.codesFile, `[${timestamp}] ${code} | ${link}\n`, 'utf8');
        } catch (error) {
            await this.logger.log(`❌ Ошибка сохранения: ${error.message}`);
        }
    }

    async test() {
        try {
            await this.bot.telegram.sendMessage(this.config.tg.chatId, '🤖 Бот запущен!');
            return true;
        } catch {
            return false;
        }
    }
}

module.exports = TelegramClient;
