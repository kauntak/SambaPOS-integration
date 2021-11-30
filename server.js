//Local server.

module.exports = {start};

const deliverect = require('./Deliverect');
const samba = require('./Samba');
const log = require('./log');
const report = require('./report');

const dotenv = require('dotenv');
const { randomUUID } = require('crypto');
const { response } = require('express');
const session = require('express-session');
const cookieParse = require('cookie-parser');
const bodyParser = require('body-parser');
const path = require('path');
const express = require('express');

const app = express();
dotenv.config();
const listenPort = process.env.LISTEN_PORT;
const hostname = 'localhost';

const whiteList = ["35.241.160.154", "35.241.180.107", "104.199.82.58", "34.79.19.218"];

const userName = process.env.AUTH_USER;
const password = process.env.AUTH_PWD;

//writing to log for the server.
function writeToLog(content){
    log.write("Server", content);
}
//write to log for Server errors
function writeToErrorLog(content){
	log.write("Server_Error", content);
}
//main function to start server.
//paired with ngrok webhook server.
//if url is /deliverect and method is post will call the deliverect process function
//if url is /report and method is get, it will pull report data from SambaPOS
//TODO: Authentication. Currently anyone can access site.
//TODO: -Staff schedule sheet access page. Staff login to view schedule and request specific times off.
//      -Managers can edit schedule and can view staff's requested times off.
//TODO: receive push requests from GloriaFood
function start(){
    writeToLog("Server Starting.\r\n\r\n\r\n");
    app.use(express.json());
    app.use(bodyParser.urlencoded({extended: true}));
    //app.use(cookieParser());
    app.use(session({
        secret:'secret',
        resave: true,
        saveUninitialized: true
    }));
    app.get("/", (req,res) => {
        res.sendFile(__dirname + '/public/login.html');
    });
    app.get("/reports", (req, res)=>{
        writeToLog("ACCESSED FROM: " + JSON.stringify(req.headers, undefined, 2));
        report.generateReport().then((html)=>{
            res.send(html);
        });
    });

    app.post("/authenticate", (req, res) => {
        console.log(res);
        let user = req.body.username == userName;
        let pwd = req.body.password == password;
        if(user && pwd){

        }
        else response.send('Incorrect Username and/or password!');
    });
    app.post("/deliverect", (req, res)=>{
        writeToLog(req.headers);
        if(whiteList.includes(req.headers['x-forwarded-for'])){
            let orderId = randomUUID();
            deliverect.processDeliverect(req.body, orderId);
            res.send(`{"posOrderId": "${orderId}"}`);
        } else res.status(401).end("Unauthorized");
    });

    
    app.use((req,res,next)=>{
        res.status(404).end("404 Page Not Found. You found a non-page!");
    });
    
    app.listen(listenPort,()=>{
        writeToLog("Server started on port: " + listenPort);
    });

}


/* depreciated code using http
const http = require('http');
async function start(){
	writeToLog("Server Starting.\r\n\r\n\r\n");
	http.createServer(async (req, res) => {
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
                    res.setHeader('Content-Type', 'text/html');
                    res.write(await report.getReport());
                }
                break;
            default:
                writeToLog(body);
        }
		res.end();
	}).listen(listenPort, hostname, () => {writeToLog(`Server started on port ${listenPort}`)});
	return;
}*/