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
let testData = [
	{
	  "id": "1CHS0KZ4AG85V64",
	  "employee": {
		"id": "4SCX9K33S7SKR",
		"name": "Non"
	  },
	  "time": "2021-11-30 16:34:22",
	  "amount": 72.19,
	  "tipAmount": 3,
	  "result": "SUCCESS",
	},
	{
	  "id": "YV0DAF7X9D1VF9P",
	  "employee": {
		"id": "4SCX9K33S7SKR",
		"name": "Non"
	  },
	  "time": "2021-11-30 16:42:00",
	  "amount": 16.49,
	  "tipAmount": 2.47,
	  "result": "SUCCESS",
	},
	{
	  "id": "VXHA75FMQVG8VZE",
	  "employee": {
		"id": "279TP8BSACGPG",
		"name": "Non"
	  },
	  "time": "2021-11-30 16:41:45",
	  "amount": 22.55,
	  "tipAmount": 3.38,
	  "result": "SUCCESS",
	},
	{
	  "id": "WT84KYFCQXMEWJE",
	  "employee": {
		"id": "4SCX9K33S7SKR",
		"name": "Non"
	  },
	  "time": "2021-11-30 16:38:13",
	  "amount": 29.98,
	  "tipAmount": 4.5,
	  "result": "SUCCESS"
	},
	{
	  "id": "1CHS0KGWZ485V64",
	  "employee": {
		"id": "4SCX9K33S7SKR",
		"name": "Non"
	  },
	  "time": "2021-11-30 16:34:22",
	  "amount": 72.19,
	  "tipAmount": 3,
	  "result": "SUCCESS"
	},
	{
	  "id": "N67XRG2KZ6T3B0J",
	  "employee": {
		"id": "4SCX9K33S7SKR",
		"name": "Non"
	  },
	  "time": "2021-11-30 17:01:19",
	  "amount": 100,
	  "tipAmount": 0,
	  "result": "SUCCESS"
	},
	{
	  "id": "7K7VWF1W60Z6HKG",
	  "employee": {
		"id": "279TP8BSACGPG",
		"name": "Non"
	  },
	  "time": "2021-11-30 17:13:58",
	  "amount": 60.64,
	  "tipAmount": 9.1,
	  "result": "SUCCESS"
	},
	{
	  "id": "6SZA9WB5T8VRPF0",
	  "employee": {
		"id": "279TP8BSACGPG",
		"name": "Non"
	  },
	  "time": "2021-11-30 17:17:25",
	  "amount": 30.31,
	  "tipAmount": 8,
	  "result": "SUCCESS"
	},
	{
	  "id": "8B5TH7X8854T0VT",
	  "employee": {
		"id": "279TP8BSACGPG",
		"name": "Non"
	  },
	  "time": "2021-11-30 17:25:53",
	  "amount": 59.27,
	  "tipAmount": 11.85,
	  "result": "SUCCESS"
	},
	{
	  "id": "K534ZT3DYFREY58",
	  "employee": {
		"id": "279TP8BSACGPG",
		"name": "Non"
	  },
	  "time": "2021-11-30 17:23:52",
	  "amount": 87.83,
	  "tipAmount": 5,
	  "result": "SUCCESS"
	},
	{
	  "id": "19XW542PAG12BSR",
	  "employee": {
		"id": "279TP8BSACGPG",
		"name": "Non"
	  },
	  "time": "2021-11-30 17:37:05",
	  "amount": 51.97,
	  "tipAmount": 0,
	  "result": "SUCCESS"
	},
	{
	  "id": "0E1RH4P0V91AG04",
	  "employee": {
		"id": "279TP8BSACGPG",
		"name": "Non"
	  },
	  "time": "2021-11-30 17:30:33",
	  "amount": 84.42,
	  "tipAmount": 8,
	  "result": "SUCCESS"
	},
	{
	  "id": "01RH4P0V9FB1G04",
	  "employee": {
		"id": "279TP8BSACGPG",
		"name": "Non"
	  },
	  "time": "2021-11-30 17:30:33",
	  "amount": 999.99,
	  "tipAmount": 8,
	  "result": "SUCCESS"
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
//Will read a date/time in the database for the last poll time and poll Clover for new payments after that date/time.
//Will get open tickets from SambaPOS.
//Iterate through the Clover Payments to check the charged amount against the remaining amount, and once found a match will settle that ticket.
//If there are any remaining tickets it will check if two payments were made for one ticket or if two tickets were paid together.
//Will set the database value for last read time to current time.
//Insert payment data into database.
//Will clear payment data other than the payments that failed.
async function loop(){
	let date = await samba.getCloverLastRead(delay + (timeout / 60000));
	let paymentOptions = `filter=createdTime>=${date.getTime()}`;
	paymentData = paymentData.concat(await Promise.all(processData(await getFromClover("payments", paymentOptions))));
	if(paymentData.length == 0 ){
		await samba.setCloverLastRead();
		return;
	}
	writeToLog("Payments: " + JSON.stringify(paymentData, undefined, 2));
	let tickets = await samba.getOpenTakeoutTickets();
	writeToLog("Tickets: " + JSON.stringify(tickets, undefined, 2));
	let terminalId = await samba.openTerminal();
	let unpaid = [];
	for(let i in paymentData) { //Will check if open tickets have same amount as paid amount, and close said ticket. Payments that were not found will be added to an unpaid array.
		if(paymentData[i].paid) continue;
		let index = tickets.findIndex(tk => tk.remainingAmount == paymentData[i].amount);
		if(index == -1){
			unpaid.push({index:i, data:paymentData[i]});
			continue;
		}
		let isPaid = await samba.payTicket(terminalId, tickets[index].id, paymentData[i].amount, paymentType);
		tickets.splice(index, 1);
		paymentData[i].paid = isPaid;
	}
	if(unpaid.length > 0 && tickets.length > 0){//Will check if two payments were made for one ticket and close said ticket
		for(let i = unpaid.length - 1; i >= 0; i--){
			let j = i - 1;
			while(j >= 0){
				let amount = round(unpaid[i].data.amount + unpaid[j].data.amount, 2);
				let index = tickets.findIndex(tk => amount == tk.remainingAmount);
				if(index != -1){
					let isPaid = await samba.payTicket(terminalId, tickets[index].id, amount, paymentType);
					paymentData[unpaid[i].index].paid = isPaid;
					paymentData[unpaid[j].index].paid = isPaid;
					unpaid.splice(i, 0);
					unpaid.splice(j, 0);
					tickets.splice(index, 0);
					i -= 2;
					break;
				}
				j--;
			}
		}
	}
	if(unpaid.length > 0 && tickets.length > 0){//Will check if one payment paid for two tickets.
		for(let i = tickets.length - 1; i >= 0; i--){
			let j = i - 1;
			while(j >= 0){
				let amount = round(tickets[i].remainingAmount + tickets[j].remainingAmount, 2);
				let index = unpaid.findIndex(payment => amount == payment.data.amount);
				if(index != -1){
					let iIsPaid = await samba.payTicket(terminalId, tickets[i].id, amount, paymentType);
					let jIsPaid = await samba.payTicket(terminalId, tickets[j].id, amount, paymentType);
					paymentData[unpaid[i].index].paid = iIsPaid;
					paymentData[unpaid[j].index].paid = jIsPaid;
					tickets.splice(i, 0);
					tickets.splice(j, 0);
					unpaid.splice(index, 0);
					i -= 2;
					break;
				}
			}
		}
	}
    await samba.closeTerminal(terminalId);
	await samba.setCloverLastRead(readDate);
    await sql.connect("Clover", paymentData);//inserting payment data into database. TODO: renaming Clover to something more intuitive
	paymentData = paymentData.filter(payment => payment.paid == false);
	console.log(paymentData);
}
//Load employees registered on the Clover system.
function loadEmployees(){
	return getFromClover('employees')
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
	payments = payments.filter(x => x.result == "SUCCESS" && new Date(x.createdTime) < date).map(async x => {
		x.employee = {id: x.employee.id};
		let name = employeeList.filter(y => y.id == x.employee.id)[0];
		if(!name){
			await loadEmployees();
			name = employeeList.filter(y => y.id == x.employee.id)[0];
		}
		if(!name)
			x.employee.name = 'No Name';
		else
			x.employee.name = name.name;
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