module.exports = {write};

const Server = require('./Server');
const Webhook = require('./Webhook');
const Clover = require('./Clover');
const Gloria = require('./Gloria');
const {performance} = require('perf_hooks');
const fork = require('child_process').fork;
const { app, BrowserWindow, ipcMain } = require('electron');


const path = require('path');
const fs = require('fs');


const isTest = false;
//start()
var window;

function createWindow(){
    window = new BrowserWindow({
        width:800,
        height: 600,
        webPreferences: {
            preload:path.join(__dirname, 'app/preload.js'),
            nodeIntegration:false,
            contextIsolation:true,
            enableRemoteModule:false
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

ipcMain.on('startApp', () => {
    Server.start();
    // Webhook.start();
    // Clover.start();
    // Gloria.start();
});


ipcMain.on('stopApp', () => {
    Server.stop();
    Webhook.stop();
    Clover.stop();
    Gloria.stop();
})

ipcMain.on('saveConfig', (event,data) => {
    console.log(data);
    //config.write(data);
});


//will log for entire app, but will separate files depending on which module has called it.
function write(source, content){
	var date = new Date();
	date = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 19).replace('T', ', ') + ":" + date.getMilliseconds();
	if(typeof content == "Object"){
	 	content = JSON.stringify(content);
    }
    
    if(!fs.existsSync('./log'))
         fs.mkdir('./log', err=> {if(err) console.log(err)});
     fs.appendFile(`log/log_${source}.txt`, `${date}: ${content}\r\n`,(err) => {
         if(err) console.log(err);
         }
     );
        
    var sendTo = "writeTo";
    if(source.search("Error") != -1){
        sendTo += "Error";
    }        
    sendTo += "Log";
	window.webContents.send(sendTo, {source:source, content:content, date:date});
}








//start();
//function for writing log for the main app.
function writeToLog(content){
    write("App",content);
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