//Integration for Gloria Foods. Will create ticket in SambaPOS for Orders placed on Gloria Foods.
//TODO: Currently Polling, will change to Push

 module.exports = {start};

 const express = require('express');
 const request = require('request');
 const querystring = require('querystring');
 const samba = require('./Samba');
 const log = require('./log');
 const dotenv = require('dotenv');
 dotenv.config();

const gloriaFoodKey = process.env.GLORIA_DINEIN_KEY;
const ticketType =  process.env.GLORIAFOOD_DINEIN_TICKET_TYPE;
const userName = process.env.USERNAME;
const password = process.env.PASSWORD;
const customerEntityType = 'Customers';
const departmentName = 'Restaurant';
const deliveryFeeCalculation = 'Delivery Service';
const promotionDiscount = 'Discount';
const tipCalculation = 'Tip';
const tableEntityType = 'Tables'
const terminalName = 'Server';
const miscProductName = 'Misc';

const timeout = 2000;
//minutes x 60000 milliseconds(1minute)
const closedTimeout =  30 * 60000;

var createTicketQry = "";

var isTest = false;
var testBody = `{"count":1,"orders":[{"instructions":"","coupons":[],"tax_list":[{"type":"item","value":0.5,"rate":0.05}],"missed_reason":null,"billing_details":null,"fulfillment_option":null,"table_number":"L1","ready":false,"updated_at":"2022-04-02T20:23:06.000Z","id":480774581,"total_price":10.5,"sub_total_price":10,"tax_value":0.5,"persons":0,"latitude":null,"longitude":null,"client_first_name":"N","client_last_name":"n","client_email":"n@nnnn.nnn","client_phone":"+14035555555","restaurant_name":"Big Catch Dine-in","currency":"CAD","type":"dine_in","status":"accepted","source":"website","pin_skipped":false,"accepted_at":"2022-04-02T20:23:06.000Z","tax_type":"NET","tax_name":"GST","fulfill_at":"2022-04-02T20:43:06.000Z","client_language":"en","integration_payment_provider":null,"integration_payment_amount":0,"reference":null,"restaurant_id":234700,"client_id":40457248,"restaurant_phone":"+1 403 708 5555","restaurant_timezone":"America/Edmonton","card_type":null,"used_payment_methods":["CASH"],"company_account_id":929082,"pos_system_id":25151,"restaurant_key":"EojqZcbeNU0dXnJlpn","restaurant_country":"Canada","restaurant_city":"Calgary","restaurant_state":"Alberta","restaurant_zipcode":"T2V0R6","restaurant_street":"8835 Macleod tr sw","restaurant_latitude":"50.97526317738458","restaurant_longitude":"-114.07346451957397","client_marketing_consent":true,"restaurant_token":"EojqZcbeNU0dXnJlpn","gateway_transaction_id":null,"gateway_type":null,"api_version":2,"payment":"CASH","for_later":false,"client_address":null,"client_address_parts":null,"items":[{"id":654778759,"name":"Big Catch 10 piece Sashimi","total_item_price":10,"price":10,"quantity":1,"instructions":"","type":"item","type_id":13556411,"tax_rate":0.05,"tax_value":0.5,"parent_id":null,"item_discount":0,"cart_discount_rate":0,"cart_discount":0,"tax_type":"NET","options":[]}]}]}`;

var lastBody;
var lastQryCompleted = true;

//writing to log for Gloriafood
function writeToLog(content){
    log.write("Gloria_dinein", content);
}
//write to log for Gloria errors
function writeToErrorLog(content){
	log.write("Gloria_dinein_Error", content);	
}

start();

//starting GloriaFood integration app. will run an infinite loop, running the "loopGloria" function
async function start(testing){
    if(testing)
        isTest = true;
	writeToLog("Gloria Dine in Started.\r\n\r\n\r\n");
    while(true){
        if(samba.isOpen()){
            try{await loopGloria();}
            catch(err){if(err) writeToErrorLog(err)}
            await new Promise(r => setTimeout(r, timeout));
            if(isTest) break;
        }
        else
            await new Promise(r => setTimeout(r, closedTimeout));
    }
}
var count = 30;
//the function to be looped.
//Polls tickets from GloriaFoods and if there are tickets will process them.
async function loopGloria() {
	if(count == 30){
		count = 0;
		writeToLog('Reading Tickets...');
	}
    if(isTest){
        processTickets(JSON.parse(testBody));
        return;
    }
    var tickets = await readTickets();
    if(tickets)
        processTickets(tickets);
	count++;
}

//Poll GloriaFoods for any accepted tickets
async function readTickets() {
	reqData = {
		method: 'POST',
		uri: 'https://pos.gloriafood.com/pos/order/pop',
		headers: {
			'Authorization': gloriaFoodKey,
			'Accept': 'application/json',
			'Glf-Api-Version': '2'
		}
	};
	if(isTest){
		var body = testBody;
		return JSON.parse(body);
	}
	return new Promise((resolve, reject) =>{
        request(reqData, (err, res, body) => {
            if (!err){
                if(body != `{"count":0,"orders":[]}`)
                   writeToLog(`Received:\r\n${body}`);
                lastQryCompleted = false;
                lastBody = JSON.parse(body);
                resolve(JSON.parse(body));
            }
            else {
                reject(err);
            }
        });	
    }).catch(err =>{
        writeToErrorLog("ERROR: " + err.message);
        return false;
    });
}
//Will process each ticket in the bulk data.
//Format for recieved data is:
//{"count": ? ,"orders":[...]}
//if count is 0, will terminate.
function processTickets(tickets) {
    if (tickets.count == 0) return;
    tickets.orders.forEach((order) => processOrder(order));
}

//Order object is made up of the following:
//instructions:String,      coupons:Array,               tax_list:Array[{"type":"item","value":6.7,"rate":0.05}]
//missed_reason:String,     billing_details:String,      fulfillment_option:String
//table_number:String,      id:String,                   total_price:float,
//sub_total_price:float,    tax_value:float,             persons:int
//latitude:float,           longitude:float,             client_first_name:String
//client_last_name:String,  client_email:String,         client_phone:String
//restaurant_name:String,   currency:String,             type:String
//status:String,            source:String,               pin_skipped:boolean
//accepted_at:String,       tax_type:String,             tax_name:String
//fulfill_at:String,        client_language:String,      integration_payment_provider:String
//integration_payment_amount:int,   reference:String,    restaurant_id:int
//client_id:int,                updated_at:String,       restaurant_phone:String
//restaurant_timezone:String,   card_type:String,        used_payment_methods:Array[String]
//company_account_id:int,       pos_system_id:int,       restaurant_key:String
//restaurant_country:String,    restaurant_city:String,  restaurant_state:String
//restaurant_zipcode:String,    restaurant_street:String,restaurant_latitude:String
//restaurant_longitude:String,  client_marketing_consent:boolean
//restaurant_token:String,      gateway_transaction_id:int?
//gateway_type:String??,        api_version:int,         payment:String
//for_later:boolean,            client_address:String    client_address_parts:String
//items:Array[{id:int, name:String,total_item_price:float,price:float,quantity:int,instructions:String, type:String, type_id:int,tax_rate:float,tax_value:float,parent_id:int,item_discount:int,cart_discount_rate:int,cart_discount:float,tax_type:String,options:Array[...]}}
//
//
//will split data into customer, service fees, instructions, table, and items, then create a new ticket.
async function processOrder(order) {
    let phone = processPhone(order.client_phone);
    // let customer = {
    //     type: customerEntityType,
    //     name: `${order.client_first_name} ${order.client_last_name}-${phone}`,
    //     customData: `,customData:[
    //         {name:"First Name",value:"${order.client_first_name}"},
    //         {name:"Last Name",value:"${order.client_last_name}"},
    //         {name:"Address",value:"${order.client_address}"},
    //         {name:"EMail",value:"${order.client_email}"},
    //         {name:"Phone",value:"${phone}"}
    //     ]`
    // };
    //let sambaCustomer = await samba.loadCustomer(customer, phone);
    let table = order.table_number;
	if(order.instructions)
		order.instructions = processComment(order.instructions);
	let services = order.items
	    .filter(x => x.type === 'tip' || x.type === 'delivery_fee' || x.type === 'promo_cart')
	    .filter(x => x.name)
	    .map(x => { return { name: getCalculationName(x.type), amount: Math.abs((x.cart_discount_rate) * 100) || x.price}; }) 
	let items = await samba.loadItems(order.items.map(x => processItem(x)).filter(x => x.type === 'item'));
    await samba.createTicket(undefined, items, order.instructions, order.fulfill_at, services, ticketType, departmentName, table);
    lastQryCompleted = true;
	return;
}

//service fees: promotional discounts, tip, and delivery fee
function getCalculationName(name) {
    if (name === 'promo_cart') return promotionDiscount;
    if (name === 'tip') return tipCalculation;
    if (name === 'delivery_fee') return deliveryFeeCalculation;
    return undefined;
}
//process phone number
function processPhone(phone){
	let match = phone.match(/^[\+]?1?[-\s\.]?[(]?([0-9]{3})[)]?[-\s\.]?([0-9]{3})[-\s\.]?([0-9]{4,6})$/);
	let number = match? `${match[1]}${match[2]}${match[3]}` : "";
	return number;
}

//will process items into a SambaPOS readable item.
function processItem(item) {
    var result = {
        id: item.id,
        name: item.name,
        type: item.type,
        price: item.price,
        quantity: item.quantity,
        instructions: processComment(item.instructions),
        options: item.options.filter(x => x.type === 'option').map(x => { return { group_name: x.group_name, name: x.name, quantity: x.quantity, price: x.price } }),
        portions: item.options.filter(x => x.type === 'size').map(x => { return { name: x.name, price: x.price}}),
		groupCode: ""
    };
    return result;
}

//removed unwanted user input
function processComment(comment){
    return comment.replace(/"/g, "'").replace(/\n/g, "  ").replace(/~/g, "-");
}


//load items from SambaPOS and return an item object.
function loadItems(items) {
    return samba.gql(getLoadItemsScript(items))
		.then(data => {
			return (items.filter(x => x.type === 'item').map(item => {
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
//Building GQL script to get customer
function getCustomerScript(customer) {
    return `{getEntity(type:"${customer.type}",name:"${customer.name}"){type,name,customData{name,value},states{stateName,state}}}`;
}

//Building GQL script to check if customer exists.
function getIsEntityExistsScript(customer) {
    return `{isEntityExists(type:"${customer.type}",name:"${customer.name}")}`;
}
//Building GQL script to add a new customer.
function getAddCustomerScript(customer) {
    return `
    mutation m{addEntity(entity:{
        entityType:"${customer.type}",name:"${customer.name}"${customer.customData}})
        {name}
    }`;
}
//Building GQL script to set new customer state to unconfrimed.
function getNewCustomerStateScript(customer) {
    return `mutation m{updateEntityState(entityTypeName:"${customer.type}",entityName:"${customer.name}",state:"Unconfirmed",stateName:"CStatus"){name}}`;
}
//Build order tags to SambaPOS format.
function GetOrderTags(order) {
    if (order.options) {
        var options = order.options.map(x => {
			if(x.group_name.includes("Salmon Type"))
			{
				if(x.name.includes("Sockeye"))
					return `{tagName:"Salmon Type",tag:"Sal > Sockeye",price:${x.price},quantity:${x.quantity}}`;
				else return;
			}
			else if(x.group_name === "Rolls")
				return `{tagName:"Combo Rolls",tag:"${x.name}",price:${x.price},quantity:${x.quantity}}`;
			return `{tagName:"Default",tag:"${x.group_name}:${x.name}",price:${x.price},quantity:${x.quantity}}`;});
        if (order.instructions && order.instructions !== '') {
			order.instructions = order.instructions.replace(/\n/g, '  ');
            options.push(`{tagName:"Default",tag:"Comment: ${order.instructions}"}`);
        }
		if(order.sambaName === miscProductName)
		{
			options.push(`{tagName:"Item Name",tag:"${order.name}"}`);
		}
        var result = options.join();
        return `tags:[${result}],`
    }
    return "";
}
//Return portions in SambaPOS format.
function GetPortions(order) {
    if (order.portions.length != 0) {
		var portions = order.portions.map(x => `portion:"${x.name}",` );
        var result = portions.join();
        return `${result}`
    } 
    return "";  
}
//Return price in SambaPOS format.
function GetOrderPrice(order) {
	if(order.portions.length !=0){
		var price = order.portions.map(x => `price:${Math.abs((x.price) + (order.price))},`);
        var result = price.join();
        return `${result}`;
        }
	return `price:${order.price},`;
}

function createTicket(customer, items, instructions, pickupTime, services, type, departmentName, table) {
    return samba.gql(getAddTicketScript(items, customer, instructions, pickupTime, services, type, departmentName, table))
		.then( data => {
            var ticketId = data.addTicket.id;
            samba.gql('mutation m {postTicketRefreshMessage(id:0){id}}');
            writeToLog(`Ticket ${ticketId} created...`);
		    return (ticketId);
		});
}

//Building GQL script to add new tickets. Will take orders, customers, instructions, pickup time, service charges, and ticket type as arguments.
function getAddTicketScript(orders, customer, instructions, fulfill_at, services, type, departmentName, table) {
    var orderLines = orders.filter(x => x.groupCode != 'Temporary open hours!!!!').map(order => {
        return `{
            name:"${order.sambaName ? order.sambaName : order.name}",
            menuItemName:"${order.sambaName === miscProductName ? miscProductName : ''}",
            quantity:${order.quantity > 0 ? order.quantity : 1},
            ${GetPortions(order)}
            ${GetOrderPrice(order)}
            ${GetOrderTags(order)}
            states:[
                {stateName:"Status",state:"Submitted"}]
        }`;
    });
    var entityPart = `entities:[{entityType:"${tableEntityType}",name:"${table}"}],`;
    var calculationsPart = services
        ? `calculations:[${services.map(x => `{name:"${x.name}",amount:${x.amount}}`).join()}],`
        : '';
	
	var coeff = 1000 * 60 * 5;
	var date = new Date();
	date = new Date(Math.round(date.getTime() / coeff) * coeff);
	
	var time = `${date.getHours()}:${date.getMinutes()<10?"0"+ date.getMinutes():date.getMinutes()}`;
	
    return `
        mutation m{addTicket(
            ticket:{type:"${type}",
                department:"${departmentName}",
                user:"${userName}",
                terminal:"${terminalName}",
                note:"${instructions !== null ? instructions : ''}",
                ${entityPart}
                states:[
                    {stateName:"Status",state:"Unconfirmed"}],
                tags:[{tagName:"Pickup Time", tag:"${time}"}],
                ${calculationsPart}
                orders:[${orderLines.join()}]
            }){id}}`;
} 
