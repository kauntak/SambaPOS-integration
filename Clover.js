//Will Poll Clover for new payments, and settle appropriate tickets in SambaPOS

module.exports = {start};

const request = require('request');
const samba = require('./samba');
const sql = require('./sql');
const log = require('./log');
const dotenv = require('dotenv');
dotenv.config();

const cloverMID = process.env.CLOVER_MID;
const cloverKey = process.env.CLOVER_KEY;
const paymentType = process.env.CLOVER_PAYMENT_TYPE;
//how long to pause between loop iteration
//minutes x 60000 milliseconds(1minute)
const timeout = 6 * 60000;
//How many minutes to delay closing tickets.
const delay = 10;

let employeeList = [];
let paymentData = [];
let readDate = new Date();
let isTest = false;
let testData = [{
    id: '0AT48JQ2B7FXCX6',
    employee: { id: 'EXQJ6ED55DAB7JPDR', name: 'Non' },
    time: '2021-11-21 12:25:47',
    amount: 100.00,
    tipAmount: 10,
    result: 'SUCCESS'
  },
  {
    id: 'Z8DNBEWGN44BF02',
    employee: { id: 'EXQJ6ED55DAB7JPDR', name: 'Non' },
    time: '2021-11-21 12:24:24',
    amount: 82.18,
    tipAmount: 6.74,
    result: 'SUCCESS'
  },
  {
    id: 'RXSC3A2QBPV8YB8',
    employee: { id: 'EXQJ6ED55DAB7JPDR', name: 'Non' },
    time: '2021-11-21 12:12:31',
    amount: 17.59,
    tipAmount: 19.93,
    result: 'SUCCESS'
  },
  {
    id: 'RXSC3A2QBPV8YB82',
    employee: { id: 'EXQJ6ED55DAB7JPDR', name: 'Non' },
    time: '2021-11-21 12:12:31',
    amount: 17.59,
    tipAmount: 19.93,
    result: 'FAILED'
  },
  {
    id: '4HB4ER6BTVRAPN0',
    employee: { id: 'EXQJ6ED55DAB7JPDR', name: 'Non' },
    time: '2021-11-21 12:10:54',
    amount: 215.67,
    tipAmount: 0,
    result: 'SUCCESS'
  }
];


//Writing to log for Clover
function writeToLog(content){
    log.write("Clover", content);
}
//Writing to log for Clover Errors.
function writeToErrorLog(content){
	log.write("Clover_Error", content);
}


//main function to run the Clover integration.
//If store is open will run an infinite loop, running the function loop(), and will pause for "timeout" milliseconds
//Otherwise will wait pause for "timeout" milliseconds * 5 to check if store is open again.
async function start(testing){
    if(testing)
        isTest = true;
	writeToLog("Clover Started.\r\n\r\n\r\n");
    await loadEmployees();
    while(true){
		if(samba.isOpen() || isTest){
			try{await loop();}
			catch(err){if(err) writeToErrorLog(err)}
			await new Promise(r => setTimeout(r, timeout));
		}
		else
			await new  Promise(r => setTimeout(r, timeout * 5));
		
    }

}

//the main function to be looped.
//Will read a date/time in the database for the last poll time and poll Clover for new payments after that date/time
//Will get open tickets from SambaPOS
//Iterate through the Clover Payments to check the charged amount against the remaining amount, and once found a match will settle that ticket.
//If there are any remaining tickets it will check if two payments were made for one ticket or if two tickets were paid together.
//Will set the database value for last read time to current time
//Insert payment data into database.
async function loop(){
	let date = await samba.getCloverLastRead(delay + (timeout / 60000));
	let paymentOptions = `filter=createdTime>=${date.getTime()}`;
	paymentData.push(...processData(await getFromClover("payments", paymentOptions)));
	if(paymentData.length == 0 ){
		await samba.setCloverLastRead();
		return;
	}
	writeToLog("Payments: " + JSON.stringify(paymentData, undefined, 2));
	let tickets = await samba.getOpenTakeoutTickets();
	writeToLog("Tickets: " + JSON.stringify(tickets, undefined, 2));
	let terminalId = await samba.openTerminal();
	let unpaid = [];
	for(let i in paymentData) { //Will check if open tickets have same amount as paid amount, and close said ticket.
		if(paymentData[i].paid) continue;
		let index = tickets.findIndex(tk => tk.remainingAmount == paymentData[i].amount);
		if(index == -1){
			unpaid.push(paymentData[i]);
			continue;
		}
		await samba.payTicket(terminalId, tickets[index].id, paymentData[i].amount, paymentType);
		tickets.splice(index, 1);
		paymentData[i].paid = true;
	}
	if(unpaid.length > 0 && tickets.length > 0){
		paidCount = 0;
		for(let i in  unpaid){ //Will check if a ticket was paid with two different transaction and close appropriate ticket.
			if(unpaid[i].paid) continue;
			let j = parseInt(i) + 1;
			while(j < unpaid.length){
				let amount = round(unpaid[i].amount + unpaid[j].amount, 2);
				let index = tickets.findIndex(tk => amount == tk.remainingAmount);
				if(index != -1){
					paidCount += 2;
					let indexes = [i,j];
					for(let k in indexes){
						let paymentIndex = paymentData.findIndex(payment => payment.id == unpaid[indexes[k]].id);
						await samba.payTicket(terminalId, tickets[index].id, paymentData[paymentIndex].amount, paymentType);
						unpaid[indexes[k]].paid = true;
						paymentData[paymentIndex].paid = true;
					}
					tickets.splice(index, 1);
					break;
				}
				j++;
			}
		}
		if(paidCount < unpaid.length){
			for(let i = tickets.length - 1; i > 0; i--){
				let j = i - 1;
				while(j >= 0){//Will check if a two ticket was paid with one transaction and close appropriate tickets.
					let amount = round(tickets[i].remainingAmount + tickets[j].remainingAmount, 2);
					let index = unpaid.findIndex(payment => payment.amount == amount && !payment.paid);
					if(index != -1){
                        await samba.payTicket(terminalId, tickets[i].id, tickets[i].remainingAmount, paymentType);
                        await samba.payTicket(terminalId, tickets[j].id, tickets[j].remainingAmount, paymentType);
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
    await samba.closeTerminal(terminalId);
	await samba.setCloverLastRead(readDate);
    await sql.connect("Clover", paymentData);//inserting payment data into database.
}
//Load employees registered on the Clover system.
function loadEmployees(){
	return getFromClover('employees',undefined)
		.then( data => {
			employeeList = data;
            return true;
    });
}

//function for polling Clover
//Type:Payments,Employees, etc.
//options:createdTime,etc.
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

//Will process data received from Clover into an array of payment object(s).
//Filter for result == "SUCCESS" as well as tickets were before the delay time.
//read employee id from employee list
//object will be:
//payment Id
//employee: employee id, and name
//time(created time)
//amount charged
//tip amount
//payment result
function processData(payments){
	writeToLog("Processing data");
	let date = new Date();
	readDate = new Date();
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
	return payments;
}

//callback function for processing JSON.parse on data received from Clover
function processCloverJSON(key,value)
{
	if(key == "amount" || key == "tipAmount")
		value = value / 100;
	else if(key == "createdTime")
		value = new Date(parseInt(value) - (new Date().getTimezoneOffset() * 60000)).toISOString().slice(0, 19).replace('T', ' ');
	return value;
}

//round any values to specified precision.(For floating point calculations.)
function round(value, precision){
	let multiplier = Math.pow(10, precision || 0);
	return Math.round(value * multiplier) / multiplier;
}