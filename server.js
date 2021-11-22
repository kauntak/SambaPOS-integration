module.exports = {start};


const http = require('http');
const request = require('request');
const querystring = require('querystring');
const fs = require('fs');
const deliverect = require('./deliverect');
const samba = require('./samba');

const dotenv = require('dotenv');
dotenv.config();
const listenPort = process.env.LISTEN_PORT;


//start();

var lastBody;
var lastQryCompleted = true;

async function start(){
	writeToLog("\r\n\r\n\r\n\r\nServer Started");
	//samba.Authorize();
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

function writeToLog(content)
{
	var date = new Date();
	date = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 19).replace('T', ', ') + ":" + date.getMilliseconds();
	if(typeof content == "Object")
	 	content = JSON.stringify(content);
	console.log(content);
	fs.appendFile('log.txt', `${date}: ${content}\r\n`,(err) => {if(err) throw err; console.log(`${content}\r\n`);})
	
}