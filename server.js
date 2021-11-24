module.exports = {start};


const http = require('http');
const deliverect = require('./Deliverect');
const samba = require('./Samba');
const log = require('./log');

const dotenv = require('dotenv');
dotenv.config();
const listenPort = process.env.LISTEN_PORT;


function writeToLog(content){
    log.write("Server", content);
}

async function start(){
	writeToLog("Server Started.\r\n\r\n\r\n");
	http.createServer((req, res) => {
		let {headers, method, url} = req;
		let body = "";
		let orderId = [];
		req.on('error', err => {
			writeToLog(err);
		}).on('data', chunk => {
			body += chunk;
		}).on('end', () => {
            if(body)
			    body = JSON.parse(body.replace(/\n/g," "));
		});
        switch(url){
            case "/deliverect":
                if(method == "POST"){
                    deliverect.processDeliverect(body);
                    res.setHeader('Content-Type', 'application/json');
                    res.write(`{"posOrderId": "${orderId}"}`);
                }
                break;
            case "/reports":
                if(method == "GET"){
                    res.setHeader('Content-Type', 'application/xhtml+xml');
                    res.write(`<h1>REPORTS</h1>`);
                }
                break;
            default:
                writeToLog(body);
        }
		res.end();
	}).listen(listenPort);
	return;
}