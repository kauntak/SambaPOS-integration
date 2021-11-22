module.exports = {start};

const ngrok = require('ngrok');
const dotenv = require('dotenv');
const samba = require('./samba');
dotenv.config();

const ngrok_options = {
	addr: process.env.NGROK_PORT,
	auth: process.env.NGROK_AUTH,
	subdomain: process.env.NGROK_SUBDOMAIN,
	authtoken: process.env.AUTH_TOKEN
};
//start();

async function start(){
    const url = await ngrok.connect(ngrok_options);
	const api = ngrok.getApi();
	const hookrequests = api.listRequests();
	samba.writeToLog("Webhook Server Started.");
	return;
}