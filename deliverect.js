module.exports = {processDeliverect, start};

const http = require('http');
const samba = require('./Samba');
const sql = require('./sql');
const log = require('./log');
const dotenv = require('dotenv');
dotenv.config();

const paymentType = process.env.DELIVERECT_PAYMENT_TYPE;
const ticketType = process.env.DELIVERECT_TICKET_TYPE;

const customerEntityType = 'Customers';
const userName = process.env.USERNAME;
const password = process.env.PASSWORD;
const terminalName = 'Server';
const miscProductName = 'Misc';
var accessToken = undefined;
var accessTokenExpires = '';

var accountId = '';
var locationId = '';
var lastReadTime;

var createTicketQry = "";

var isTest = false;
var testBody = `{"count":1,"orders":[{"instructions":"","coupons":[],"tax_list":[{"type":"item","value":5.17,"rate":0.05}],"missed_reason":null,"billing_details":null,"fulfillment_option":null,"table_number":null,"id":363899374,"total_price":108.47,"sub_total_price":103.3,"tax_value":5.17,"persons":0,"latitude":null,"longitude":null,"client_first_name":"Gordon","client_last_name":"Hoglund","client_email":"gordonhoglund@gmail.com","client_phone":"+14034715338","restaurant_name":"Big Catch Sushi Bar","currency":"CAD","type":"pickup","status":"accepted","source":"mobile_web","pin_skipped":false,"accepted_at":"2021-09-11T22:59:08.000Z","tax_type":"NET","tax_name":"GST","fulfill_at":"2021-09-11T23:45:00.000Z","client_language":"en","integration_payment_provider":null,"integration_payment_amount":0,"reference":null,"restaurant_id":119850,"client_id":7313289,"updated_at":"2021-09-11T22:59:08.000Z","restaurant_phone":"+1 403 708 5555","restaurant_timezone":"America/Edmonton","card_type":null,"used_payment_methods":["CARD"],"company_account_id":690517,"pos_system_id":30221,"restaurant_key":"r4gDyCxd0s1D3d5n0","restaurant_country":"Canada","restaurant_city":"Calgary","restaurant_state":"Alberta","restaurant_zipcode":"T2V0R6","restaurant_street":"8835 Macleod Tr SW #130","restaurant_latitude":"50.975124689951656","restaurant_longitude":"-114.07356644351654","client_marketing_consent":true,"restaurant_token":"EojqZcbeNU0dXnJlpn","gateway_transaction_id":null,"gateway_type":null,"api_version":2,"payment":"CARD","for_later":true,"client_address":null,"client_address_parts":null,"items":[{"id":501094384,"name":"Wed-Sat▼11:30am-2:30pm / 4:30pm-8:15pm","total_item_price":0,"price":0,"quantity":1,"instructions":"Peanut, cashew and soy protein allergy","type":"item","type_id":4239419,"tax_rate":0.05,"tax_value":0,"parent_id":null,"item_discount":0,"cart_discount_rate":0,"cart_discount":0,"tax_type":"NET","options":[]},{"id":501120976,"name":"Iron Goddess","total_item_price":16.45,"price":16.45,"quantity":1,"instructions":"","type":"item","type_id":3247109,"tax_rate":0.05,"tax_value":0.8225,"parent_id":null,"item_discount":0,"cart_discount_rate":0,"cart_discount":0,"tax_type":"NET","options":[]},{"id":501121396,"name":"Tropic Rush","total_item_price":18.2,"price":16.25,"quantity":1,"instructions":"","type":"item","type_id":3247147,"tax_rate":0.05,"tax_value":0.8125,"parent_id":null,"item_discount":0,"cart_discount_rate":0,"cart_discount":0,"tax_type":"NET","options":[{"id":452904865,"name":"Sockeye (Wild)","price":1.95,"group_name":"Salmon Type","quantity":1,"type":"option","type_id":3558548}]},{"id":501121667,"name":"Magic Mushroom","total_item_price":16.25,"price":16.25,"quantity":1,"instructions":"","type":"item","type_id":3247164,"tax_rate":0.05,"tax_value":0.8125,"parent_id":null,"item_discount":0,"cart_discount_rate":0,"cart_discount":0,"tax_type":"NET","options":[]},{"id":501122007,"name":"Meteor Rain","total_item_price":18.8,"price":16.85,"quantity":1,"instructions":"","type":"item","type_id":7040966,"tax_rate":0.05,"tax_value":0.8425,"parent_id":null,"item_discount":0,"cart_discount_rate":0,"cart_discount":0,"tax_type":"NET","options":[{"id":452905308,"name":"Sockeye (Wild)","price":1.95,"group_name":"Salmon Type","quantity":1,"type":"option","type_id":3558548}]},{"id":501123000,"name":"Yam Tempura Roll","total_item_price":8.95,"price":8.95,"quantity":1,"instructions":"","type":"item","type_id":3265102,"tax_rate":0.05,"tax_value":0.4475,"parent_id":null,"item_discount":0,"cart_discount_rate":0,"cart_discount":0,"tax_type":"NET","options":[]},{"id":501124639,"name":"Crispy Gyoza","total_item_price":6.75,"price":6.75,"quantity":1,"instructions":"","type":"item","type_id":3267616,"tax_rate":0.05,"tax_value":0.3375,"parent_id":null,"item_discount":0,"cart_discount_rate":0,"cart_discount":0,"tax_type":"NET","options":[]},{"id":501126976,"name":"Avocado Roll","total_item_price":8.95,"price":8.95,"quantity":1,"instructions":"","type":"item","type_id":3265110,"tax_rate":0.05,"tax_value":0.4475,"parent_id":null,"item_discount":0,"cart_discount_rate":0,"cart_discount":0,"tax_type":"NET","options":[]},{"id":501127427,"name":"Dynamite Roll","total_item_price":8.95,"price":8.95,"quantity":1,"instructions":"","type":"item","type_id":3265094,"tax_rate":0.05,"tax_value":0.4475,"parent_id":null,"item_discount":0,"cart_discount_rate":0,"cart_discount":0,"tax_type":"NET","options":[]}]}]}`;
var testQry = `{"query":"{isEntityExists(type:\"Customers\",name:\"Jennifer Dominie-+14038266041\")}"}`;

var channels = {
	"1":{entityType:"Skip", constructor: Skip},
	"0":{entityType:"Doordash", constructor: Door}
};

function Skip(data){
	this.name = "S-" + data.channelDisplayId;
	this.subData = `,customData:[{name:"Name",value:"${data.name}"}]`;
}

function Door(data){
	this.name = "D-" + data.name;
	this.subData = '';
}


var lastBody;
var lastQryCompleted = true;

//writing to log for deliverect module
function writeToLog(content){
    log.write("Deliverect", content);
}


async function start(testing){
    if(testing)
        isTest = true;
	writeToLog("Deliverect Reader Started.\r\n\r\n\r\n");
	lastReadTime = await samba.getDeliverectLastRead();
	
	//return;
	return;
}

//will check order total, if 0 return
//for each order that is received it will check the order status and call the required function.
//after orders have been processed, the orders will be inserted into DeliverectOrders database
async function processDeliverect(data) {
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
	await sql.connect(sql.insertIntoDeliverectDB(insertData));
}

//split ticket into Ticket Details, items, and customer, create ticket, and return an object that can be inserted into DeliverectOrder database
async function processOrder(order) {
    var orderData = processOrderData(order)
	orderData.entity = channels[order.channel].constructor(orderData);
	if(order.note)
		order.note = order.note.replace(/\\"/g,`\\\\"`);
	var customer = await createCustomer(orderData);
	
	let items = await samba.loadItems(order.items.map(x => processItem(x)));
    orderData.ticketId = await samba.createTicket(sambaCustomer, items, order.instructions, order.fulfill_at, services, ticketType);
    lastQryCompleted = true;
	return orderData;



	loadItems(order.items.map(x => processItem(x)))
		.then( items => {
			createTicket(customer, items, order.note, orderData.time)
				.then( ticketId => {
					gql('mutation m {postTicketRefreshMessage(id:0){id}}');
					writeToLog(`Ticket ${ticketId} created...`);
					lastQryCompleted = true;
				});
			
		});
	return;
}
//TODO: Cancel order, void ticket/orders from SambaPOS, update Kitchen Display
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
function processItem(item) {
	console.log(item);
	if(!item.remark)
		item.remark = "";
    var result = {
        id: item.plu.replace(/-/g, ""),
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        instructions: item.remark.replace(/\"/g, "\\\""),
        options: item.subItems.map(x => { return { group_name: x.group_name, name: x.name, quantity: x.quantity, price: x.price } }),
		groupCode: ""
    };
    return result;
}