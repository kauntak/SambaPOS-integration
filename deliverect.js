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
const deliverectOrderTagName = process.env.DELIVERECT_ORDER_TAG_NAME;
const departmentName = process.env.DELIVERECT_DEPARTMENT_NAME
const tipCalculation = 'Tip';
const miscProductName = 'Misc';

var accountId = '';
var locationId = '';
var lastReadTime;

var isTest = false;


var idList = [];
var entities = {
	"10": Skip,
	"12": Door
};

function Skip(data){
	let displayName = "S-" + data.channelDisplayId.slice(-5);
	return {
		name : data.channelDisplayId,
		type : "Skip",
		customData : `,customData:[{name:"Display",value:"${displayName}"}, {name:"Name",value:"${data.name}"}, {name:"isPickup",value:"${data.isPickup?'PICKUP ORDER':''}"}]`
	};
}

function Door(data){
	let displayName = "D-" + data.name;
	return {
		name : data.channelDisplayId,
		type : "Doordash",
		customData : `,customData:[{name:"Display",value:"${displayName}"}, {name:"isPickup",value:"${data.isPickup?'PICKUP ORDER':''}"}]`
	};
}

var testBody = {};
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
//start();
//Originally for testing, will be removed
//TODO remove.
async function start(testing){
	console.log("test");
    if(testing)
        isTest = true;
	//writeToLog("Deliverect Reader Started.\r\n\r\n\r\n");
	//lastReadTime = await samba.getDeliverectLastRead();
	processOrder(testBody);
	//return;
	return;
}

//will check total orders, if 0 return
//for each order that is received it will check the order status and call the required function.
//after orders have been processed, the orders will be inserted into DeliverectOrders database
async function processDeliverect(order, orderUID) {
	writeToLog(JSON.stringify(order, undefined, 2));
	if(order.status == 20 || order.status == 120){
		if(idList.find(id => id == order["_id"])) 
			return;
		idList.push(order["_id"]);
		if(idList.length > 50)
			idList.shift();
		{
			let insertData = {orderUID:orderUID, deliverectId:order["_id"]};
			insertData.ticketId = await processOrder(order);
			await insertIntoDeliverectDB(insertData);
		}
	} else if(order.status == 100) {
		cancelOrder(order);
	} else if(order.status == 90) finalizeOrder(order);
}

//split ticket into Ticket Details, items, and customer, will create ticket, and return an object that can be inserted into DeliverectOrder database
async function processOrder(order) {
    var ticketData = createTicketData(order);
	if(order.note)
		order.note = processComment(order.note, ticketData.name);
	else order.note = "";
	let services;
	if(order.tip > 0){
		services = [
			{name: tipCalculation, amount:order.tip/Math.pow(10, ticketData.decimalDigits)},
		];
	}
	let customer = await samba.loadCustomer(ticketData.entity);
	let items = await samba.loadItems(order.items.map(item => processItem(item, ticketData.decimalDigits)));
	let ticketId = await samba.createTicket(customer, items, order.note, ticketData.time, services, ticketType, departmentName);
	return ticketId;
}


//void ticket/orders from SambaPOS, update Kitchen Display Tasks to Show Cancelled
async function cancelOrder(order){
	let ticketData = await getTicketData(order.orderId);
	if(!ticketData || ticketData.isCancelled) return;
	writeToLog(`Cancelling order ${order.orderId} Ticket:${ticketData.ticketId}`);
	await updateDisplaysAsCancelled(ticketData);
	await voidTicket(ticketData);
	await updateTicketData(ticketData.ticketId,"isCancelled", 1);
}
//TODO: remove delivery upcharge from ticket price amd settle corresponding ticket, 
async function finalizeOrder(order){
	let ticketData = await getTicketData(order.orderId);
	if(!ticketData || ticketData.isCompleted) return;
	writeToLog(`Finalizing order ${order.orderId} Ticket:${ticketData.ticketId}`);
	await changeTicketPrice(ticketData);
	await payTicket(ticketData);
	await updateTicketData(ticketData.ticketId, "isCompleted",1)
}

//will return an object with
//order id,		customer name,		customer phone,
//origin order company(Skip/Doordash), origin Company order id,
//origin company display id,  fulfillment time, total amount paid,
//order note, and the decimal digits to offset for the order price(eg digits:2, price:1234, actual dollar amount is $12.34)
function createTicketData(order){
	/**
	 * 
	 * order["_id"]
	 * order.channel: 10 for skip, 12 for Door
	 * order.channelOrderDisplayId: channel order id
	 * order.customer.name
	 * order.orderType: 1 for pickup, 2 for delivery
	 * order.pickupTime
	 * order.payment.amount
	 * order.note
	 * order.decimalDigits
	 * 
	 * order.items:
	 * 		order.items[].name
	 * 		order.items[].price
	 * 		order.items[].quantity
	 * 		order.items[].remark
	 * 		order.items[].subItems:
	 *	 		order.items[].subItems[].name
	 *	 		order.items[].subItems[].price
	 *	 		order.items[].subItems[].quantity
	 * 
	 */
	let data =  {
		id:	order["_id"],
        name: order.customer.name,
		channelDisplayId: order.channelOrderDisplayId,
		time: new Date(order.pickupTime),
		note: order.note,
		amount: order.payment.amount/(Math.pow(10, order.decimalDigits)),
		decimalDigits: order.decimalDigits,
		isPickup : order.orderType == 1
    };
	data.entity = entities[order.channel](data);
	return data;
}


//removed unwanted user input
function processComment(comment, name){
    return comment.replace(/"/g, "'").replace(/\n/g, "  ").replace(/~/g, "-").replace(name, "").replace("[CONTACTLESS] ", "");
}

//will process items into a SambaPOS readable item.
function processItem(item, digits) {
	if(!digits)
		digits = 0;
	if(!item.remark)
		item.remark = "";
	else
		item.remark = processComment(item.remark);
    return {
        id: item.plu.replace(/[^A-Za-z0-9]/g, ""),
        name: item.name,
        price: item.price / Math.pow(10, digits),
        quantity: item.quantity,
        instructions: item.remark,
        options: item.subItems.map(subItem => { 
			return { group_name: deliverectOrderTagName, name: subItem.name, quantity: subItem.quantity, price: subItem.price/ Math.pow(10, digits) }; }),
		portions: [],
		groupCode: ""
    };
}

function insertIntoDeliverectDB(data){
	let qry = `
		INSERT INTO in_deliverect_orders(posId, deliverectId, ticketId, isCancelled, isCompleted)
		SELECT '${data.orderUID}', '${data.deliverectId}', ${data.ticketId}, 0, 0
		WHERE NOT EXISTS(
			SELECT * FROM in_deliverect_orders WHERE deliverectId = '${data.deliverectId}'
		)`;
	return sql.exec(qry);
}

//Get the SambaPOS ticket data for the corresponding order
function getTicketData(orderId){
	let qry = `
		SELECT ticketId, ticketNumber, isCancelled, in_deliverect_orders.isCompleted
		FROM in_deliverect_orders
		JOIN Tickets on Tickets.Id = ticketId
		WHERE deliverectId = '${orderId}'`;
	return sql.query(qry)
		.then(res => res[0]);
}

function updateTicketData(ticketId, name, state){
	if( !(name instanceof Array) ) name = [name];
	let stringArray = [];
	for(let i in name){
		stringArray.push(`${name[i]} = ${state instanceof Array? state[i] : state}`);
	}
	let qry = `
		UPDATE in_deliverect_orders
		SET ${stringArray.toString()}
		WHERE ticketId = ${ticketId}`;
	return sql.exec(qry);
}

//update the Kitchen Displays, to label the order as cancelled.
async function updateDisplaysAsCancelled(data){
	let qry = `
		UPDATE Tasks
		SET [Content] = CONCAT([CONTENT], CHAR(10), '<color red><bold><size 22>CANCELLED</size></bold></color>')`
	//qry += `WHERE Identifier = '${data.ticketNumber}'`;
	qry += `WHERE Name = '${data.ticketNumber}'`;
	await sql.exec(qry);
	qry = `
		SELECT TaskTypes.Name as Name
		FROM [SambaPOS5].[dbo].[Tasks]
		JOIN TaskTypes on TaskTypeId = TaskTypes.Id
		WHERE Tasks.Name = '${data.ticketNumber}'
		AND SubOf IS NULL
		`;
	let displays = await sql.query(qry);
	for(let i in displays){
		let displayChar = displays[i].Name.charAt(0);
		await samba.broadcast(`Order Sent ${displayChar}DS`);
	}
}

//Void all order items on ticket, and settle ticket.
function voidTicket(data){
	let qry = `
	DECLARE @TICKET_ID int = ${data.ticketId}

	UPDATE Orders
	SET
		OrderStates = REPLACE(OrderStates, value, REPLACE(value, '"S":"'+ S + '",', '"S":"Void",')),
		CalculatePrice = 0,
		DecreaseInventory = 0,
		LastUpdateDateTime = CURRENT_TIMESTAMP
	FROM Orders as o2
	CROSS APPLY OPENJSON(o2.OrderStates, '$') states
	CROSS APPLY OPENJSON(states.value) WITH(
		SN nvarchar(50),
		S nvarchar(50)
	) vals
	WHERE SN = 'GStatus'
	AND TicketId = @TICKET_ID

	UPDATE Tickets
	SET 
		LastUpdateTime = CURRENT_TIMESTAMP,
		TicketVersion = CURRENT_TIMESTAMP,
		IsClosed = 1,
		RemainingAmount = 0,
		TotalAmount = 0,
		TotalAmountPreTax = 0,
		TicketStates = REPLACE(TicketStates, value, REPLACE(value, '"S":'+S+'",', '"S":"Paid",')),
		IsCompleted = 1
	FROM Tickets
	CROSS APPLY OPENJSON(TicketStates, '$') states
	CROSS APPLY OPENJSON(states.value) WITH(
		SN nvarchar(50),
		S nvarchar(50)
	) vals
	WHERE SN = 'Status'
	AND Id = @TICKET_ID`
	
	return sql.exec(qry);
	
	// samba.openTerminal()
	// .then(terminalId => samba.loadTicket(terminalId, data.ticketId)
	// 	.then(id => samba.executeTicketAutomationCommand(terminalId, "Void All Items", "id")
	// 		.then(id => samba.closeTicket(terminalId)
	// 			.then(() => {
	// 				samba.closeTerminal();
					
	// 			})
	// 		)
	// 	)
	// );
}

//changes ticket price to takeout price amount(removes delivery upcharge)
function changeTicketPrice(data){
	let qry = `
	DECLARE @TICKET_ID int = ${data.ticketId}

	UPDATE Orders
		SET OrderTags = REPLACE(OrderTags, value, REPLACE(value, ',"PR":' + CAST(PR as nvarchar) + ',', ',"PR":' + CAST(CAST(PR/1.16 as decimal(16,2)) as nvarchar) + ','))
	FROM Orders
	CROSS APPLY OPENJSON(OrderTags, '$') tags
	CROSS APPLY OPENJSON(tags.value) WITH(
		TN nvarchar(50),
		TV nvarchar(50),
		PR decimal(16,2)
	) vals
	WHERE PR IS NOT NULL
	AND OrderTags != ''
	AND OrderTags IS NOT NULL
	AND TicketId = @TICKET_ID


	UPDATE Orders
	SET
		PriceTag = 
			CASE
				WHEN PriceTag IS NULL THEN NULL
				ELSE 'Takeout'
			END,
		
		LastUpdateDateTime = CURRENT_TIMESTAMP,
		Price = CAST((
				ISNULL(
					(SELECT 
						CASE
							WHEN MenuItemPrices.Price != 0 THEN MenuItemPrices.Price
							WHEN MenuItemPrices.Price IS NULL THEN o1.price/1.16
							ELSE o1.Price / 1.16
						END
					FROM MenuItemPrices 
					JOIN MenuItemPortions ON MenuItemPrices.MenuItemPortionId = MenuItemPortions.Id
					WHERE MenuItemPortions.Name = o1.PortionName
					AND MenuItemPortions.MenuItemId = o1.MenuItemId
					AND MenuItemPrices.PriceTag = 'Takeout'
					), 0) + 
				ISNULL(
					(SELECT
						SUM(PR)
					FROM Orders as o2
					CROSS APPLY OPENJSON(o2.OrderTags, '$') tags
					CROSS APPLY OPENJSON(tags.value) WITH(
						TN nvarchar(50),
						TV nvarchar(50),
						PR decimal(16,2)
					) vals
					WHERE PR IS NOT NULL
					AND o2.OrderTags != ''
					AND o2.OrderTags IS NOT NULL
					AND o2.id = o1.id
					), 0)

			) as decimal(16,2))
	FROM Orders as o1
	WHERE TicketId = @TICKET_ID

	DECLARE @ITEM_TOTAL_PRICE decimal(16,2)

	SELECT @ITEM_TOTAL_PRICE=SUM(Price * Quantity)
	FROM Orders
	WHERE TicketId = @TICKET_ID

	UPDATE Tickets
	SET TotalAmountPreTax = @ITEM_TOTAL_PRICE,
	LastUpdateTime = CURRENT_TIMESTAMP,
	TicketVersion = CURRENT_TIMESTAMP,
	TotalAmount = @ITEM_TOTAL_PRICE * 1.05,
	RemainingAmount = @ITEM_TOTAL_PRICE * 1.05
	WHERE Id = @TICKET_ID

	`;
	return sql.exec(qry);
	// samba.openTerminal()
	// .then(terminalId => samba.loadTicket(terminalId, data.ticketId)
	// 	.then(() => samba.executeTicketAutomationCommand(terminalId, "Change Price to Takeout", "remainingAmount")
	// 		.then(remainingAmount => samba.closeTicket(terminalId)
	// 			.then(() => samba.closeTerminal(()=> remainingAmount))
	// 		)
	// 	)
	// );
};


function payTicket(data){
	let amount = `(SELECT RemainingAmount FROM Tickets WHERE Id = ${data.ticketId})`
	return sql.payTicket(data.ticketId, amount, paymentType);
}