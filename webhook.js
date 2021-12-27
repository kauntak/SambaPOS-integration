//Start ngrok webserver, and create a tunnel to connect local server to it.

module.exports = {start, stop};

const ngrok = require('ngrok');
const dotenv = require('dotenv');
const log = require('./app');
dotenv.config();

const ngrok_options = {
	addr: process.env.NGROK_PORT,
	//auth: process.env.NGROK_AUTH,
	subdomain: process.env.NGROK_SUBDOMAIN,
	authtoken: process.env.AUTH_TOKEN
};
//start();
process.on("message", msg => {
    switch(msg){
        case "start":
            start();
            break;
        case "stop":
            stop();
            break;
    }
});
//writing to log for ngrok web server
function writeToLog(content){
    log.write("Webhook", content);
}
let url;
let api;
let hookrequests;
//starting ngrok server.
//will create a tunnel to local Server.
async function start(){
    url = await ngrok.connect(ngrok_options);
	api = ngrok.getApi();
	hookrequests = api.listRequests();
	writeToLog("Webhook Server Started.");
}

async function stop(){
	await ngrok.disconnect();
	writeToLog("Webhook disconnected.");
}