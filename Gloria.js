module.exports = {start};

const express = require('express');
const request = require('request');
const querystring = require('querystring');
const samba = require('./Samba');
const log = require('./log');
const dotenv = require('dotenv');
dotenv.config();

const gloriaFoodKey = process.env.GLORIAFOOD_KEY;
const ticketType =  process.env.GLORIAFOOD_TICKET_TYPE;
const customerEntityType = 'Customers';
const timeout = 2000;

var createTicketQry = "";

var isTest = false;
var testBody = `{"count":1,"orders":[{"instructions":"","coupons":[],"tax_list":[{"type":"item","value":4.61,"rate":0.05}],"missed_reason":null,"billing_details":null,"fulfillment_option":null,"table_number":null,"id":407129522,"total_price":96.81,"sub_total_price":92.2,"tax_value":4.61,"persons":0,"latitude":null,"longitude":null,"client_first_name":"Redacted","client_last_name":"Redacted","client_email":"redacted@redacted.com","client_phone":"+5555555755","restaurant_name":"Big Catch Sushi Bar","currency":"CAD","type":"pickup","status":"accepted","source":"mobile_web","pin_skipped":false,"accepted_at":"2021-11-25T00:27:38.000Z","tax_type":"NET","tax_name":"GST","fulfill_at":"2021-11-26T00:52:38.000Z","client_language":"en","integration_payment_provider":null,"integration_payment_amount":0,"reference":null,"restaurant_id":119850,"client_id":10123236,"updated_at":"2021-11-25T00:27:38.000Z","restaurant_phone":"+1 403 708 5555","restaurant_timezone":"America/Edmonton","card_type":null,"used_payment_methods":["CARD"],"company_account_id":80000,"pos_system_id":30221,"restaurant_key":"redacted","restaurant_country":"Canada","restaurant_city":"Calgary","restaurant_state":"Alberta","restaurant_zipcode":"T2V0R6","restaurant_street":"8835 Macleod Tr SW #130","restaurant_latitude":"50.975124689951656","restaurant_longitude":"-114.07356644351654","client_marketing_consent":true,"restaurant_token":"redacted","gateway_transaction_id":null,"gateway_type":null,"api_version":2,"payment":"CARD","for_later":false,"client_address":null,"client_address_parts":null,"items":[{"id":557930929,"name":"Sprout ・ 2 - 3ppl","total_item_price":52.75,"price":52.75,"quantity":1,"instructions":"","type":"item","type_id":3247017,"tax_rate":0.05,"tax_value":2.6375,"parent_id":null,"item_discount":0,"cart_discount_rate":0,"cart_discount":0,"tax_type":"NET","options":[{"id":500559353,"name":"Atlantic Salmon","price":0,"group_name":"Sprout Platter Salmon Type","quantity":1,"type":"option","type_id":9691825}]},{"id":557931549,"name":"Iron Goddess","total_item_price":16.45,"price":16.45,"quantity":1,"instructions":"","type":"item","type_id":3247109,"tax_rate":0.05,"tax_value":0.8225,"parent_id":null,"item_discount":0,"cart_discount_rate":0,"cart_discount":0,"tax_type":"NET","options":[]},{"id":557932227,"name":"Jupiter Rain","total_item_price":16.25,"price":16.25,"quantity":1,"instructions":"","type":"item","type_id":3247145,"tax_rate":0.05,"tax_value":0.8125,"parent_id":null,"item_discount":0,"cart_discount_rate":0,"cart_discount":0,"tax_type":"NET","options":[]},{"id":557933054,"name":"Crispy Gyoza","total_item_price":6.75,"price":6.75,"quantity":1,"instructions":"","type":"item","type_id":3267616,"tax_rate":0.05,"tax_value":0.3375,"parent_id":null,"item_discount":0,"cart_discount_rate":0,"cart_discount":0,"tax_type":"NET","options":[]}]}]}`;

var lastBody;
var lastQryCompleted = true;

//writing to log for Gloriafood
function writeToLog(content){
    log.write("Gloria", content);
}
//write to log for Gloria errors
function writeToErrorLog(content){
	log.write("Gloria_Error", content);
}

//starting GloriaFood integration app. will run an infinite loop, running the "loop" function
async function start(testing){
    if(testing)
        isTest = true;
	writeToLog("Gloria Started.\r\n\r\n\r\n");
    while(true){
        try{await loop();}
        catch(err){if(err) writeToErrorLog(err)}
        await new Promise(r => setTimeout(r, timeout));
        if(isTest) break;
    }
}

//the function to be looped.
//Polls tickets from GloriaFoods and if there are tickets will process them.
async function loop() {
    writeToLog('Reading Tickets...');
    var tickets = await readTickets();
    if(tickets)
        processTickets(tickets);
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
		body = body.replace(/\n/g, "   ").replace(/\\/g, "\\\\");
		return JSON.parse(body);
	}
	return new Promise((resolve, reject) =>{
        request(reqData, (err, res, body) => {
            if (!err){
                if(body != `{"count":0,"orders":[]}`)
                   writeToLog(`Received:\r\n${body}`);
                body = body.replace(/\n/g, "    ");
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
//will split data into customer, service fees, instructions, and items
async function processOrder(order) {
    let phone = processPhone(order.client_phone);
    let customer = {
        type: customerEntityType,
        name: `${order.client_first_name} ${order.client_last_name}-${phone}`,
        customData: `,customData:[
            {name:"First Name",value:"${order.client_first_name}"},
            {name:"Last Name",value:"${order.client_last_name}"},
            {name:"Address",value:"${order.client_address}"},
            {name:"EMail",value:"${order.client_email}"},
            {name:"Phone",value:"${phone}"}
        ]`
    };
	if(order.instructions)
		order.instructions = order.instructions.replace(/\\"/g, '\\\\"');
    let sambaCustomer = await samba.loadCustomer(customer);
	var services = order.items
	   .filter(x => x.type === 'tip' || x.type === 'delivery_fee' || x.type === 'promo_cart')
		.filter(x => x.name)
	   .map(x => { return { name: getCalculationName(x.type), amount: Math.abs((x.cart_discount_rate) * 100) || x.price}; }) 
	let items = await samba.loadItems(order.items.map(x => processItem(x)));
    await samba.createTicket(sambaCustomer, items, order.instructions, order.fulfill_at, services, ticketType);
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
    return phone.match(/^\+?(\d{10})/)[1];
}

//will process items into a SambaPOS readable item.
function processItem(item) {
    var result = {
        id: item.id,
        name: item.name,
        type: item.type,
        price: item.price,
        quantity: item.quantity,
        instructions: item.instructions,
        options: item.options.filter(x => x.type === 'option').map(x => { return { group_name: x.group_name, name: x.name, quantity: x.quantity, price: x.price } }),
        portions: item.options.filter(x => x.type === 'size').map(x => { return { name: x.name, price: x.price}}),
		groupCode: ""
    };
    return result;
}