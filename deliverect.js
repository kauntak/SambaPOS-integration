//Processing incoming deliverect orders, and creating new tickets in SambaPOS

module.exports = {processDeliverect, start};

const http = require('http');
const samba = require('./Samba');
const sql = require('./sql');
const log = require('./log');
const dotenv = require('dotenv');
dotenv.config();

const paymentType = process.env.DELIVERECT_PAYMENT_TYPE;
const ticketType = process.env.DELIVERECT_TICKET_TYPE;

var accountId = '';
var locationId = '';
var lastReadTime;

var isTest = false;

var channels = {
	"1":{entityType:"Skip", constructor: Skip},
	"0":{entityType:"Doordash", constructor: Door}
};

function Skip(data){
	this.name = "S-" + data.channelDisplayId;
	this.type = "Skip",
	this.customData = `,customData:[{name:"Name",value:"${data.name}"}]`;
}

function Door(data){
	this.name = "D-" + data.name;
	this.type = "Door",
	this.customData = '';
}


var lastBody;
var lastQryCompleted = true;

//writing to log for deliverect module
function writeToLog(content){
    log.write("Deliverect", content);
}

//write to log for Deliverect errors
function writeToErrorLog(content){
	log.write("Deliverect_Error", content);
}

//Originally for testing, will be removed
//TODO remove.
async function start(testing){
    if(testing)
        isTest = true;
	writeToLog("Deliverect Reader Started.\r\n\r\n\r\n");
	lastReadTime = await samba.getDeliverectLastRead();
	
	//return;
	return;
}

//will check total orders, if 0 return
//for each order that is received it will check the order status and call the required function.
//after orders have been processed, the orders will be inserted into DeliverectOrders database
async function processDeliverect(data, orderUID) {
	writeToLog(data);
	return;
	if (data["_meta"].total == 0 ) return;
	let insertData = [];
    data["_items"].forEach(async (order) => {
		if(order.status == 20){
			let resData = await processOrder(order);
			insertData.push(resData);
		}else if(order.status == 100)
			cancelOrder(order);
		else if(order.status == 90)
			finalizeOrder(order)
	});
	await sql.connect(sql.insertIntoDeliverectDB(insertData, orderUID));
}

//split ticket into Ticket Details, items, and customer, will create ticket, and return an object that can be inserted into DeliverectOrder database
async function processOrder(order) {
    var orderData = processOrderData(order)
	orderData.entity = orderData.company.constructor(orderData);
	if(order.note)
		order.note = order.note.replace(/\\"/g,`\\\\"`);
	else order.note = "";
	var customer = await loadCustomer(orderData.entity);
	
	let items = await samba.loadItems(order.items.map(x => processItem(x, orderData.decimalDigits)));
    orderData.ticketId = await samba.createTicket(customer, items, order.note, order.time, services, ticketType);
	return orderData;
}
//TODO: Cancel order, void ticket/orders from SambaPOS, update Kitchen Display Task
async function cancelOrder(order){
	return;
}
//TODO: Settle corresponding ticket
function finalizeOrder(order){
	return;
}

//will return an object with
//order id,		customer name,		customer phone,
//origin order company(Skip/Doordash), origin Company order id,
//origin company display id,  fulfillment time, total amount paid,
//order note, and the decimal digits to offset for the order price(eg digits:2, price:1234, actual dollar amount is $12.34)
function processOrderData(order){
	return {
		id: order["_id"],
        name: order.customer.name,
        phone: order.customer.phoneNumber,
		company: channels[order.channel],
		channelId: order.channelOrderId,
		channelDisplayId: order.channelOrderDisplayId,
		time: new Date(order.pickupTime),
		note: order.note,
		amount: order.payment.amount,
		decimalDigits: order.decimalDigits
    };
}
//will process items into a SambaPOS readable item.
function processItem(item, digits) {
	if(!digits)
		digits = 0;
	console.log(item);
	if(!item.remark)
		item.remark = "";
    var result = {
        id: item.plu.replace(/-/g, ""),
        name: item.name,
        price: item.price / Math.pow(10, digits),
        quantity: item.quantity,
        instructions: item.remark.replace(/\"/g, "\\\""),
        options: item.subItems.map(x => { 
			let values = x.name.split("/");
			return { group_name: values[0], name: values[1], quantity: x.quantity, price: x.price }; }),
		groupCode: ""
    };
    return result;
}