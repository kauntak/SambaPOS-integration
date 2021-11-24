const log = require('./log');
const Server = require('./Server');
const Webhook = require('./Webhook');
const Clover = require('./Clover');
const Gloria = require('./Gloria');

start();

function writeToLog(content){
    log.write("App",content);
}

async function start(){
    writeToLog("App Started.\r\n\r\n\r\n");
    Server.start();
    Webhook.start();
    Gloria.start();
    Clover.start();
    return;
}