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

var testBody = {
	"_id": "61ba5c8a92a410f539359b3a",
	"_created": "2021-12-15T21:22:18.671000Z",
	"_updated": "2021-12-15T21:22:22.203000Z",
	"_etag": "",
	"account": "615f77ac4b260a6857698250",
	"channelOrderId": "TEST1639603339",
	"channelOrderDisplayId": "TEST1639603339",
	"posId": "",
	"posReceiptId": "",
	"posLocationId": "",
	"status": 20,
	"statusHistory": [
	  {
		"timeStamp": "2021-12-15T21:22:18.823000Z",
		"status": 4,
		"response": "",
		"source": 2
	  },
	  {
		"timeStamp": "2021-12-15T21:22:18.826000Z",
		"status": 1,
		"response": "",
		"source": 5
	  },
	  {
		"status": 3,
		"source": 5,
		"timeStamp": "2021-12-15T21:22:19.017000Z",
		"response": ""
	  },
	  {
		"timeStamp": "2021-12-15T21:22:19.043000Z",
		"status": 1,
		"response": "",
		"source": 1
	  },
	  {
		"timeStamp": "2021-12-15T21:22:20Z",
		"status": 6,
		"response": "Device ID: 7bca4edee2349179",
		"source": 3
	  },
	  {
		"timeStamp": "2021-12-15T21:22:22Z",
		"status": 10,
		"response": "",
		"source": 3
	  },
	  {
		"timeStamp": "2021-12-15T21:22:26Z",
		"status": 20,
		"response": "",
		"source": 3
	  }
	],
	"packaging": {
	  "includeCutlery": false
	},
	"channelStatusHistory": [],
	"by": "Deliverect",
	"orderType": 2,
	"channel": 10,
	"pos": 20000,
	"rating": [],
	"pickupTime": "2021-12-15T21:22:19Z",
	"deliveryTime": "2021-12-15T21:22:19Z",
	"deliveryIsAsap": true,
	"courier": {
	  "deliveryBy": "restaurant"
	},
	"customer": {
	  "name": "Non K",
	  "companyName": "Big Catch",
	  "phoneNumber": "+14037085555",
	  "email": "eats@bigcatchcalgary.ca",
	  "note": ""
	},
	"deliveryAddress": {
	  "street": "The Krook",
	  "streetNumber": "4",
	  "postalCode": "8888KL",
	  "city": "Gent",
	  "extraAddressInfo": ""
	},
	"orderIsAlreadyPaid": true,
	"taxes": [
	  {
		"name": "taxes",
		"taxClassId": 0,
		"total": 1107
	  }
	],
	"taxTotal": 1107,
	"payment": {
	  "amount": 27077,
	  "type": 0,
	  "due": 0
	},
	"note": "This is a test order \"test\"",
	"items": [
	  {
		"plu": "46774688",
		"name": "★Chef's Choice Sashimi 12pc",
		"sortOrder": 0,
		"price": 4265,
		"quantity": 1,
		"productType": 1,
		"isInternal": false,
		"subItems": []
	  },
	  {
		"plu": "46774892",
		"name": "Atlantic Salmon Nigiri",
		"sortOrder": 0,
		"price": 320,
		"quantity": 12,
		"productType": 1,
		"isInternal": false,
		"subItems": []
	  },
	  {
		"plu": "46770005",
		"name": "Sprout 2-3ppl",
		"sortOrder": 0,
		"price": 6120,
		"quantity": 1,
		"productType": 1,
		"isInternal": false,
		"subItems": [
		  {
			"plu": "M-SO-CVXz-161",
			"name": "Sockeye Salmon(Wild)",
			"sortOrder": 0,
			"price": 455,
			"quantity": 1,
			"productType": 2,
			"isInternal": false,
			"subItems": []
		  }
		]
	  },
	  {
		"plu": "46769986",
		"name": "Green Halo",
		"sortOrder": 0,
		"price": 1910,
		"quantity": 1,
		"productType": 1,
		"isInternal": false,
		"subItems": [
		  {
			"plu": "M-SO-YXIz-8",
			"name": "Sockeye Salmon(Wild)",
			"sortOrder": 0,
			"price": 225,
			"quantity": 1,
			"productType": 2,
			"isInternal": false,
			"subItems": []
		  }
		]
	  },
	  {
		"plu": "46769986",
		"name": "Green Halo",
		"sortOrder": 0,
		"price": 1910,
		"quantity": 1,
		"productType": 1,
		"isInternal": false,
		"subItems": []
	  },
	  {
		"plu": "46770008",
		"name": "Prawn Tempura",
		"sortOrder": 0,
		"price": 1305,
		"quantity": 1,
		"productType": 1,
		"isInternal": false,
		"subItems": []
	  },
	  {
		"plu": "140031761",
		"name": "★Sweet Potato Panna Cotta",
		"sortOrder": 0,
		"price": 460,
		"quantity": 1,
		"productType": 1,
		"isInternal": false,
		"subItems": []
	  },
	  {
		"plu": "1190275063",
		"name": "Sapporo Bottle - 3 pack",
		"sortOrder": 0,
		"price": 1740,
		"quantity": 1,
		"productType": 1,
		"isInternal": false,
		"subItems": []
	  },
	  {
		"plu": "1190275064",
		"name": "Sapporo Bottle",
		"sortOrder": 0,
		"price": 725,
		"quantity": 1,
		"productType": 1,
		"isInternal": false,
		"subItems": []
	  },
	  {
		"plu": "1190275066",
		"name": "Masumi White 300ml",
		"sortOrder": 0,
		"price": 3015,
		"quantity": 1,
		"productType": 1,
		"isInternal": false,
		"subItems": []
	  }
	],
	"decimalDigits": 2,
	"numberOfCustomers": 1,
	"channelOrderRawId": "61ba5c8ab19a2853dc7cd58d",
	"serviceCharge": 0,
	"deliveryCost": 0,
	"bagFee": 0,
	"tip": 0,
	"driverTip": 0,
	"discountTotal": 0,
	"posCustomerId": "",
	"historyDriverUpdates": [],
	"capacityUsages": [],
	"trackPOSId": false,
	"recent": true,
	"resolvedBy": "",
	"brandId": "615f77ac4b260a685769824f",
	"testOrder": true
  };
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
start();
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
async function processDeliverect(data, orderUID) {
	writeToLog(data);
	return;
	if (data["_meta"].total == 0 ) return;
	let insertData = [];
    data["_items"].forEach(async (order) => {
		if(order.status == 20 || order.status == 120){
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
	ticketData.ticketId = await samba.createTicket(customer, items, order.note, ticketData.time, services, ticketType, departmentName);
	return ticketData;
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
    return comment.replace(/"/g, "'").replace(/\n/g, "  ").replace(/~/g, "-").replace(name, "");
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

//load items from SambaPOS and return an item object.
function loadItems(items) {
    return samba.gql(getLoadItemsScript(items))
		.then(data => {
			return (items.map(item => {
				return {
					id: item.id,
					name: item.name,
					type: item.type,
					sambaName: data[`i${item.id}`]===null ? miscProductName : data[`i${item.id}`].name,
					price: item.price,
					quantity: item.quantity,
					instructions: item.instructions,
					options: item.options,
					portions: item.portions,
					groupCode: data[`i${item.id}`]===null ? miscProductName : data[`i${item.id}`].groupCode
				}
			}));
		});
}
//Build GQL script for retreiving items from SambaPOS
function getLoadItemsScript(items) {
    var part = items.map(item => `i${item.id}: getProduct(name:"${item.name}"){name, groupCode} `);
    return `{${part}}`;
}