//Will Poll Clover for new payments, and settle appropriate tickets in SambaPOS

module.exports = {start};

const request = require('request');
const samba = require('./samba');
const sql = require('./sql');
const log = require('./log');
const config = require('./config/config');

const cloverMID = config.Clover.merchantId;
const cloverKey = config.Clover.key;
const paymentType = config.Clover.paymentType;
//how long to pause between loop iteration
//minutes x 60000 milliseconds(1minute)
const timeout = 6 * 60000;
const closedTimeout =  30 * 60000;
//How many minutes to delay closing tickets.
const delay = 10;

let employeeList = [];
let paymentData = [];
let readDate = new Date();
let isTest = false;
let testData = [
	{
		"id": "0MQ3SYV7GR880PT",
		"employee": {
		  "id": "4Z3FGZ4FEHQKG62",
		  "name": "Non"
		},
		"time": "2021-12-10 17:33:37",
		"amount": 55.49,
		"tipAmount": 11.1,
		"result": "SUCCESS"
	  },
	  {
		"id": "094YKEA78YZ5X9P",
		"employee": {
		  "id": "4Z3FGZ4FEHQKG62",
		  "name": "Non"
		},
		"time": "2021-12-10 17:33:34",
		"amount": 73.24,
		"tipAmount": 14.65,
		"result": "SUCCESS"
	  },
	  {
		"id": "6HD5AK0FFETSJ38",
		"employee": {
		  "id": "4Z3FGZ4FEHQKG62",
		  "name": "Non"
		},
		"time": "2021-12-10 17:31:06",
		"amount": 225,
		"tipAmount": 0,
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

start();

//main function to run the Clover integration.
//If store is open will run an infinite loop, running the function loopClover(), and will pause for "timeout" milliseconds
//Otherwise will wait pause for "timeout" milliseconds * 5 to check if store is open again.
async function start(testing){
    if(testing){
        isTest = true;
		paymentData = testData;
	}
	writeToLog("Clover Started.\r\n\r\n\r\n");
    await loadEmployees();
    while(true){
		if(samba.isOpen() || isTest){
			try{await loopClover();}
			catch(err){if(err) writeToErrorLog(err)}
			await new Promise(r => setTimeout(r, timeout));
		}
		else
			await new  Promise(r => setTimeout(r, closedTimeout));
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
async function loopClover(){
	loadPayments();
	
	if(paymentData.length == 0 ){
		await setCloverLastRead();
		return;
	}
	let tickets = await getOpenTickets();
	if(tickets.length == 0){
		await setCloverLastRead();
		return;
	}
	let unpaid = [];
	for(let i in paymentData) { //Will check if open tickets have same amount as paid amount, and close said ticket. Payments that were not found will be added to an unpaid array.
		if(paymentData[i].paid) continue;
		let index = tickets.findIndex(tk => tk.remainingAmount == paymentData[i].amount);
		if(index == -1){
			unpaid.push({index:i, data:paymentData[i]});
			continue;
		}
		let isPaid = await payTicket(tickets[index].id, paymentData[i].amount, paymentType);
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
					let isPaidI = await payTicket(tickets[index].id, unpaid[i].data.amount, paymentType);
					let isPaidJ = await payTicket(tickets[index].id, unpaid[j].data.amount, paymentType);
					paymentData[unpaid[i].index].paid = isPaidI;
					paymentData[unpaid[j].index].paid = isPaidJ;
					unpaid.splice(i, 0);
					unpaid.splice(j, 0);
					tickets.splice(index, 0);
					i -= 1;
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
					let iIsPaid = await payTicket(tickets[i].id, amount, paymentType);
					let jIsPaid = await payTicket(tickets[j].id, amount, paymentType);
					paymentData[unpaid[i].index].paid = iIsPaid;
					paymentData[unpaid[j].index].paid = jIsPaid;
					tickets.splice(i, 0);
					tickets.splice(j, 0);
					unpaid.splice(index, 0);
					i -= 1;
					break;
				}
				j--;
			}
		}
	}
    await setCloverLastRead();
    await insertIntoPaymentsDB();
	paymentData = paymentData.filter(payment => payment.paid == false);
	console.log(paymentData);
}
//Load employees registered on the Clover system.
function loadEmployees(){
	return getFromClover('employees')
		.then( data => {
			employeeList = data;
            return true;
    }).catch(err => writeToErrorLog(err));
}

//Get value for when clover was last polled
function getCloverLastRead(delay){
    return samba.getGlobalSetting("lastCloverCheck").then(res => {
        let date = new Date(res);
        if(delay)
            date.setMinutes(date.getMinutes() - delay);
        return date;
    }).catch( err => writeToErrorLog(err) );
}

//Setting value for when Clover was last polled
function setCloverLastRead(date){
	if(!date)
		date = new Date();
    return samba.updateGlobalSetting("lastCloverCheck", date.toJSON())
		.then(() => true)
		.catch( err => writeToErrorLog(err) );
}
	
//retreiving all currently open tickets that are not on hold (state is "Unpaid"), and are not delivery. sorted by pickup time.
function getOpenTickets(){
	return samba.gql(getOpenTicketsScript())
		.then(tickets =>{
			tickets = tickets.getTickets.filter(ticket =>
				ticket.states.filter(state => state.state == "Unpaid").length != 0 && ticket.type != 'Delivery Ticket'
			).map(ticket => {
				ticket.states = ticket.states.filter(state => state.state == "Unpaid");
				ticket.tags = ticket.tags.flatMap(tag => {
					if (tag.tagName == "Pickup Time")
						return [tag];
					else
						return [];
					});
				return ticket;
				});
			tickets.sort( (a,b) => {
					let aTag = a.tags[0].tag;
					let bTag = b.tags[0].tag;
					if(aTag > bTag){
						return 1;
					}
					else if(aTag < bTag){
						return -1;
					}
					return 0;
				});
			writeToLog("Tickets: " + JSON.stringify(tickets, undefined, 2));
			return tickets;
		});
}
function getOpenTicketsScript(){
	return `{getTickets(isClosed: false) {id, type, remainingAmount, states{state, stateName}, tags{tag, tagName}, entities{name}}}`;
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
    });
}

//Get payments from specified time from Clover
function getPaymentData(date){
	let paymentOptions = `filter=createdTime>=${date.getTime()}`;
	return getFromClover("payments", paymentOptions)
		.catch( err => {
			writeToErrorLog(err);
			return [];
		});
}
async function loadPayments(){
	let date = await getCloverLastRead(delay + (timeout / 60000));
	paymentData = paymentData.concat(await Promise.all(processData(await getPaymentData(date))));
	if(paymentData.length == 0)
		writeToLog("Payments: " + JSON.stringify(paymentData, undefined, 2));
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
		let employeeData = employeeList.filter(y => y.id == x.employee.id)[0];
		if(!employeeData){
			await loadEmployees();
			employeeData = employeeList.filter(y => y.id == x.employee.id)[0];
		}
		if(!employeeData)
			x.employee.name = 'No Name';
		else
			x.employee.name = employeeData.name;
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

//pay Ticket
function payTicket(ticketId, amount, paymentType){
	return sql.payTicket(ticketId, amount, paymentType)
		.then(res => {
			console.log(`Paid $${amount} for Ticket ${ticketId}.`)
			return res;
		})
		.catch(err => {
			writeToErrorLog(err);
			return false;
		});
}

//Inserting processed data received from Clover into CreditTerminalTransaction
function insertIntoPaymentsDB(){
	let qry = `DECLARE @JSON NVARCHAR(MAX) = '${JSON.stringify(paymentData)}';
			
		CREATE TABLE #TEMP(
			[Payment_Date] [nvarchar](50) NOT NULL,
			[Payment_ID] [nvarchar](50) NOT NULL,
			[Amount] [float] NOT NULL,
			[Tip_Amount] [float] NULL,
			[Payment_Employee_ID] [nvarchar](50) NOT NULL,
			[Payment_Employee_Name] [nvarchar](50) NOT NULL,
			[Result] [nvarchar](50) NOT NULL
			)ON [PRIMARY];
		
		INSERT INTO #TEMP ([Payment_Date],[Payment_ID],[Amount],[Tip_Amount],[Payment_Employee_ID],[Payment_Employee_Name],[Result])
		SELECT Date,Id,Amount,TipAmount,EmployeeId,EmployeeName,Result
		FROM OPENJSON(@JSON)
		WITH (
			Date datetime '$.time',
			Id nvarchar(30) '$.id',
			Amount float '$.amount',
			TipAmount float '$.tipAmount',
			EmployeeId nvarchar(20) '$.employee.id',
			EmployeeName nvarchar(20) '$.employee.name',
			Result nvarchar(20) '$.result'
			)
		WHERE Result = 'SUCCESS';
		
		INSERT INTO CreditTerminalTransactions([Payment_Date],[Payment_ID],[Amount],[Tip_Amount],[Payment_Employee_ID],[Payment_Employee_Name],[Result])
		SELECT [Payment_Date],[Payment_ID],[Amount],[Tip_Amount],[Payment_Employee_ID],[Payment_Employee_Name],[Result] FROM #TEMP
		WHERE NOT EXISTS(SELECT CreditTerminalTransactions.Payment_ID FROM CreditTerminalTransactions WHERE CreditTerminalTransactions.Payment_ID = #TEMP.Payment_ID collate SQL_Latin1_General_CP1_CI_AS);
		
		DROP TABLE #TEMP;`
	return sql.exec(qry)
		.then(res => {
			writeToLog(`Payment Data added to DB.`);
			return true;
		})
		.catch(err => {
			writeToErrorLog("QUERY:" + qry + "\r\nERROR:" + err);
			return false;
		});
}