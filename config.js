// config.js
module.exports = {
    vk: {
        domain: 'recodetest',
        triggerText: 'Код набора на этой неделе:',
        checkInterval: 60000,
        accessToken: '',
        apiVersion: '5.131'
    },
    tg: {
        token: '',
        chatId: ''
    },
    files: {
        state: 'last_post_id.txt',
        log: 'bot.log',
        codes: 'found_codes.txt'
    }
};