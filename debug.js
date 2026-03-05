// debug.js
const readline = require('readline');

function analyzePost(text, triggerText, extractCode) {
    console.log('\n' + '🔍 АНАЛИЗ ПОСТА');
    console.log('─'.repeat(40));
    
    const hasTrigger = text.includes(triggerText);
    const code = extractCode(text);
    
    console.log(`Триггер: ${hasTrigger ? '✅' : '❌'}`);
    console.log(`Код: ${code || '❌ не найден'}`);
    console.log(`Результат: ${(hasTrigger && code) ? '✅ Будет отправлен' : '❌ Не будет'}`);
    console.log('─'.repeat(40));
}

function startDebug(triggerText, extractCode) {
    console.log('\n🔧 РЕЖИМ ДЕБАГА (exit для выхода)\n');
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    const ask = () => {
        rl.question('👉 ', (text) => {
            if (text.toLowerCase() === 'exit') {
                rl.close();
                return;
            }
            analyzePost(text, triggerText, extractCode);
            console.log('');
            ask();
        });
    };
    
    ask();
}

module.exports = { startDebug };