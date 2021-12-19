//Local server.

module.exports = {start};

const deliverect = require('./Deliverect');
//const samba = require('./Samba');
const log = require('./log');
const report = require('./report');

const { randomUUID } = require('crypto');
const { response } = require('express');
const session = require('express-session');
const cookieParse = require('cookie-parser');
const bodyParser = require('body-parser');
const path = require('path');
const express = require('express');
const { request } = require('http');
const users = require('./Users');

const app = express();


const config = require('./config/config');
const listenPort = config.Server.port;
const hostname = config.Server.hostname;



//writing to log for the server.
function writeToLog(content){
    log.write("Server", content);
}
//write to log for Server errors
function writeToErrorLog(content){
	log.write("Server_Error", content);
}

start();
//main function to start server.
//paired with ngrok webhook server.
//if url is /deliverect and method is post will call the deliverect process function
//if url is /report and method is get, it will pull report data from SambaPOS
//TODO: Authentication. Currently single user is stored as .env variable. Change to database.
//TODO: Forgot password link. Will email registered email address with a password reset link.
//TODO: -Staff schedule sheet access page. Staff login to view schedule and request specific times off.
//      -Managers can edit schedule and can view staff's requested times off.
//      -Managers can add/remove staff
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
    app.get("/login", (req,res) => {
        res.sendFile(__dirname + '/public/login.html');
    });
    app.get("/reports", (req, res)=>{
        writeToLog("ACCESSED FROM: " + JSON.stringify(req.headers, undefined, 2));
        if(req.session.loggedin)
            report.generateReport().then( html =>{
                res.send(html);
            });
        else res.redirect('/login');
    });
    app.get("/reset_password", (req,res)=>{
        res.sendFile(__dirname + '/public/reset_password.html');
    });


    app.post("/authenticate", (req, res) => {
        console.log(res);
        if(users.checkUserAndPassword(req.body.username, req.body.password)){
            req.session.loggedin = true;
            req.session.username = req.body.username;
            res.redirect('/reports');
        }
        else res.send('Incorrect Username and/or password!');
    });

    //TODO: setup email sending.
    app.post("/reset_password", (req, res) =>{
        let email = req.body.email;
        //
        //res.send() email sent to: ${email} html page.
        res.send('Ask Non.');
    });

    app.post("/deliverect", (req, res)=>{
        writeToLog(req.headers);
        let posRes = deliverect.processDeliverect(req);
        if(posRes === 401){
            res.status(401).end("Unauthorized");
        } else
            res.send(posRes);
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