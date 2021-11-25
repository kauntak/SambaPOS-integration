module.exports = {start};


const http = require('http');
const deliverect = require('./Deliverect');
const samba = require('./Samba');
const log = require('./log');

const dotenv = require('dotenv');
dotenv.config();
const listenPort = process.env.LISTEN_PORT;

//writing to log for the server.
function writeToLog(content){
    log.write("Server", content);
}

//main function to start server.
//paired with ngrok server.
//if url is /deliverect and method is post will call the deliverect process function
//if url is /report and method is get, it will pull report data from SambaPOS
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