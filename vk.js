// vk.js
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class VKClient {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.stateFile = path.join(__dirname, config.files.state);
    }

    async getPosts() {
        try {
            const response = await axios.get('https://api.vk.com/method/wall.get', {
                params: {
                    domain: this.config.vk.domain,
                    count: 2,
                    v: this.config.vk.apiVersion,
                    access_token: this.config.vk.accessToken
                },
                timeout: 10000
            });
            
            if (response.data.error) {
                await this.logger.log(`❌ VK API: ${response.data.error.error_msg}`);
                return [];
            }
            
            const posts = response.data.response?.items || [];
            
            // Оставляем только нужные поля
            return posts.map(post => ({
                id: post.id,
                owner_id: post.owner_id,
                text: post.text || ''
            }));
            
        } catch (error) {
            await this.logger.log(`❌ Ошибка VK: ${error.message}`);
            return [];
        }
    }

    async loadLastId() {
        try {
            const data = await fs.readFile(this.stateFile, 'utf8');
            return parseInt(data, 10);
        } catch {
            return null;
        }
    }

    async saveLastId(id) {
        try {
            await fs.writeFile(this.stateFile, id.toString(), 'utf8');
            await this.logger.log(`💾 Сохранен ID: ${id}`);
        } catch (error) {
            await this.logger.log(`❌ Ошибка сохранения ID: ${error.message}`);
        }
    }

    extractCode(text) {
        if (!text) return null;
        
        // Только один паттерн - 10 символов
        const match = text.match(/\b[A-Z0-9]{10}\b/);
        return match ? match[0] : null;
    }

    hasTrigger(text) {
        return text && text.includes(this.config.vk.triggerText);
    }

    getPostLink(post) {
        return `https://vk.com/${this.config.vk.domain}?w=wall${post.owner_id}_${post.id}`;
    }
}

module.exports = VKClient;
