const log = require('./log');
//const Server = require('./Server');
//const Webhook = require('./Webhook');
//const Clover = require('./Clover');
//const Gloria = require('./Gloria');
const {performance} = require('perf_hooks');
const fork = require('child_process').fork;
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const isTest = false;
//start()



return;

function createWindow(){
    const window = new BrowserWindow({
        width:800,
        height: 600,
        webPreferences: {
            preload:path.join(__dirname, 'app/preload.js')
        }
    });

    window.loadFile('App/index.html');
}


app.whenReady().then(() => {
    createWindow();

    app.on('activate', () =>{
        if(BrowserWindow.getAllWindows().length === 0) 
            createWindow();
    });
});

app.on('window-all-closed', () => {
    if(process.platform !== 'darwin')
        app.quit();
});

















//start();
//function for writing log for the main app.
function writeToLog(content){
    log.write("App",content);
}

//start the app:
//-Server
//-Webhook server
//-GloriaFood integration
//-Clover Auto-settle integration
//TODO create an interface that has settings for environment variables.
async function start(){
    //let start = performance.now();
    //let end = performance.now()
    //let dif = end-start;
    //console.log(dif + " milliseconds");
    //return;
    writeToLog("App Started.\r\n\r\n\r\n");
    //Server.start(isTest);
    //Webhook.start(isTest);
    //Gloria.start(isTest);
    //Clover.start(isTest);
    const Server = fork('./Server');
    // const Webhook = fork('./Webhook');
    // const Clover = fork('./Clover');
    // const Gloria = fork('./Gloria');
    //const Hold = fork('./HoldOrders');
}