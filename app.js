const log = require('./log');
const Server = require('./Server');
const Webhook = require('./Webhook');
const Clover = require('./Clover');
const Gloria = require('./Gloria');

start();
//function for writing log for the main app.
function writeToLog(content){
    log.write("App",content);
}

//start the app:
//-Server
//-Webhook server
//-GloriaFood integration
//-Clover Auto-settle integration
async function start(){
    writeToLog("App Started.\r\n\r\n\r\n");
    Server.start();
    Webhook.start();
    Gloria.start();
    Clover.start();
}