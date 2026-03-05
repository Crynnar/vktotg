// logger.js
const fs = require('fs').promises;
const path = require('path');

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
        this.buffer.push(logMessage + '\n');
        
        if (this.buffer.length > 100) await this.flush();
    }

    async flush() {
        if (this.buffer.length === 0) return;
        try {
            await fs.appendFile(this.filename, this.buffer.join(''), 'utf8');
            this.buffer = [];
        } catch (error) {
            console.error('Ошибка записи лога:', error.message);
        }
    }

    async close() {
        clearInterval(this.flushInterval);
        await this.flush();
    }
}

module.exports = Logger;
