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

const gloriaFoodKey = process.env.GLORIAFOOD_KEY;
const ticketType =  process.env.GLORIAFOOD_TICKET_TYPE;
const customerEntityType = 'Customers';
const timeout = 2000;
//minutes x 60000 milliseconds(1minute)
const closedTimeout =  30 * 60000;

var createTicketQry = "";

var isTest = false;
var testBody = `{"count":0,"orders":[]}`;

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
        if(samba.isOpen()){
            try{await loop();}
            catch(err){if(err) writeToErrorLog(err)}
            await new Promise(r => setTimeout(r, timeout));
            if(isTest) break;
        }
        else
            await new Promise(r => setTimeout(r, timeout * 30));
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
//will split data into customer, service fees, instructions, and items, and create a new ticket.
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
		order.instructions = processComment(order.instructions);
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