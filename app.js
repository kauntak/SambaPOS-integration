const log = require('./log');
const Server = require('./Server');
const Webhook = require('./Webhook');
const Clover = require('./Clover');
const Gloria = require('./Gloria');
const {performance} = require('perf_hooks');

const isTest = false;

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
    //let start = performance.now();
    //let end = performance.now()
    //let dif = end-start;
    //console.log(dif + " milliseconds");
    //console.log(data);
    //return;
    writeToLog("App Started.\r\n\r\n\r\n");
    Server.start(isTest);
    Webhook.start(isTest);
    Gloria.start(isTest);
    Clover.start(isTest);
}