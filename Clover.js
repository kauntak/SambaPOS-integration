module.exports = {start};

const request = require('request');
const samba = require('./samba');
const sql = require('./sql');
const log = require('./log');
const dotenv = require('dotenv');
dotenv.config();

const cloverMID = process.env.CLOVER_MID;
const cloverKey = process.env.CLOVER_KEY;

//minutes x 60000 milliseconds(1minute)
const timeout = 6 * 60000;

let employeeList = [];
let paymentData = [];
let isTest = false;


function writeToLog(content){
    log.write("Clover", content);
}
start();
async function start(testing){
    if(testing)
        isTest = true;
	writeToLog("Clover Started.\r\n\r\n\r\n");
    await loadEmployees();
    while(true){
        await loop();
        await new Promise(r => setTimeout(r, timeout));
    }

}

async function loop(){
    let date = await samba.getCloverLastRead(10 + (timeout / 60000) + 4320);
    let paymentOptions = `filter=createdTime>=${date.getTime()}`;
    paymentData.push(...processData(await getFromClover("payments", paymentOptions)));
    if(paymentData.length == 0 ){
		await samba.setCloverLastRead();
		return;
	}
	writeToLog("Payments: " + JSON.stringify(paymentData, undefined, 2));
	console.log(paymentData);
	let tickets = await samba.getOpenTakeoutTickets();
	writeToLog("Tickets: " + JSON.stringify(tickets, undefined, 2));
	let terminalId = await samba.openTerminal();
	let unpaid = [];
	for(let i in paymentData) {
		if(paymentData[i].paid) continue;
		let index = tickets.findIndex(tk => tk.remainingAmount == paymentData[i].amount);
		if(index == -1){
			unpaid.push(paymentData[i]);
			continue;
		}
		await samba.payTicket(terminalId, tickets[index].id, paymentData[i].amount);
        await samba.closeTicket();
		tickets.splice(index, 1);
		paymentData[i].paid = true;
	}
	if(unpaid.length > 0 && tickets.length > 0){
		paidCount = 0;
		for(let i in  unpaid){
			if(unpaid[i].paid) continue;
			let j = parseInt(i) + 1;
			while(j < unpaid.length){
				let amount = unpaid[i].amount + unpaid[j].amount;
				let index = tickets.findIndex(tk => amount == tk.remainingAmount);
				if(index != -1){
					//list.ticketsToPay.push(tickets[index].id);
					tickets.splice(index, 1);
					unpaid[i].paid = true;
					unpaid[j].paid = true;
					paidCount += 2;
					let paymentIndex = paymentData.findIndex(payment => payment.id == unpaid[i].id);
                    await samba.payTicket(terminalId, tickets[index].id, paymentData[paymentIndex].amount);
					paymentData[paymentIndex].paid = true;
					paymentIndex = paymentData.findIndex(payment => payment.id == unpaid[j].id);
                    await samba.payTicket(terminalId, tickets[index].id, paymentData[paymentIndex].amount);
					paymentData[paymentIndex].paid = true;
                    await samba.closeTicket();
					break;
				}
				j++;
			}
		}
		if(paidCount < unpaid.length){
			for(let i = tickets.length - 1; i > 0; i--){
				let j = i - 1;
				while(j >= 0){
					let amount = tickets[i].remainingAmount + tickets[j].remainingAmount;
					let index = unpaid.findIndex(payment => payment.amount == amount && !payment.paid);
					if(index != -1){
						//list.ticketsToPay.push(tickets[i].id, tickets[j].id);
                        await samba.payTicket(terminalId, tickets[i].id, tickets[i].remainingAmount);
                        await samba.closeTicket();
                        await samba.payTicket(terminalId, tickets[j].id, tickets[j].remainingAmount);
                        await samba.closeTicket();
						unpaid[index].paid = true;
						tickets.splice(i,1);
						tickets.splice(j,1);
						break;
					}
					j--;
				}
			}
		}
	}
    await samba.closeTerminal();
	await samba.setCloverLastRead();
    await sql.connect(() => sql.insertIntoPaymentsDB(paymentData));
}

function loadEmployees(){
	return getFromClover('employees',undefined)
		.then( data => {
			employeeList = data;
            return true;
    });
}


function getFromClover(type,options) {
    let reqData = {
        headers: {
            'Accept': 'application/json',
            'Authorization': 'Bearer ' + cloverKey
        },
        uri: `https://api.clover.com/v3/merchants/${cloverMID}/${type}?${options ? options:''}&limit=100`,
        method: 'GET'
    }
    return new Promise((resolve, reject) =>{
        request(reqData, (err, res, body) => {
            if (!err){
                resolve(JSON.parse(body,(key,value) =>  processCloverJSON(key, value)).elements);
            }
            else {
                reject(err);
            }
        });	
    }).catch(err =>{
        writeToLog("ERROR: " + err.message);
        return false;
    });
}

function processData(payments)
{
	writeToLog("Processing data");
	let date = new Date();
	date.setMinutes(date.getMinutes() - 10);
	payments = payments.filter(x => x.result == "SUCCESS" && new Date(x.createdTime) < date).map(x => {
		x.employee = {id: x.employee.id,
			name: `${employeeList.filter(y => y.id == x.employee.id)[0]?employeeList.filter(y => y.id == x.employee.id)[0].name:'No Name'}`};
		return {
			id: x.id,
				employee: {
					id: x.employee.id,
					name: x.employee.name},
				time: x.createdTime,
				amount: x.amount,
				tipAmount: x.tipAmount,
				result: x.result
			};
		});
	console.log(payments);
	return payments;
}

function processCloverJSON(key,value)
{
	if(key == "amount" || key == "tipAmount")
		value = value / 100;
	else if(key == "createdTime")
		value = new Date(parseInt(value) - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 19).replace('T', ' ');
	return value;
}