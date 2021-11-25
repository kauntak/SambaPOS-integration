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
const timeout = 2000;

var createTicketQry = "";

var isTest = false;
var testBody = `{"count":1,"orders":[{"instructions":"If possible could you please add a note:\n\"Happy Birthday Ivy!!\" :)\n\nThank you!","coupons":[],"tax_list":[{"type":"item","value":6.7,"rate":0.05}],"missed_reason":null,"billing_details":null,"fulfillment_option":null,"table_number":null,"id":403041500,"total_price":140.6,"sub_total_price":133.9,"tax_value":6.7,"persons":0,"latitude":null,"longitude":null,"client_first_name":"Tyler","client_last_name":"Roesler","client_email":"tyler@roesler.com","client_phone":"+14039697477","restaurant_name":"Big Catch Sushi Bar","currency":"CAD","type":"pickup","status":"accepted","source":"mobile_web","pin_skipped":false,"accepted_at":"2021-11-17T23:15:40.000Z","tax_type":"NET","tax_name":"GST","fulfill_at":"2021-11-18T00:15:00.000Z","client_language":"en","integration_payment_provider":null,"integration_payment_amount":0,"reference":null,"restaurant_id":119850,"client_id":9966368,"updated_at":"2021-11-17T23:15:40.000Z","restaurant_phone":"+1 403 708 5555","restaurant_timezone":"America/Edmonton","card_type":null,"used_payment_methods":["CARD"],"company_account_id":690517,"pos_system_id":30221,"restaurant_key":"r4gDyCxd0s1D3d5n0","restaurant_country":"Canada","restaurant_city":"Calgary","restaurant_state":"Alberta","restaurant_zipcode":"T2V0R6","restaurant_street":"8835 Macleod Tr SW #130","restaurant_latitude":"50.975124689951656","restaurant_longitude":"-114.07356644351654","client_marketing_consent":true,"restaurant_token":"EojqZcbeNU0dXnJlpn","gateway_transaction_id":null,"gateway_type":null,"api_version":2,"payment":"CARD","for_later":true,"client_address":null,"client_address_parts":null,"items":[{"id":552404478,"name":"Extra Ginger","total_item_price":0.25,"price":0.25,"quantity":1,"instructions":"","type":"item","type_id":8727967,"tax_rate":0.05,"tax_value":0.0125,"parent_id":null,"item_discount":0,"cart_discount_rate":0,"cart_discount":0,"tax_type":"NET","options":[]},{"id":552404520,"name":"Extra Wasabi","total_item_price":0.25,"price":0.25,"quantity":1,"instructions":"","type":"item","type_id":8727968,"tax_rate":0.05,"tax_value":0.0125,"parent_id":null,"item_discount":0,"cart_discount_rate":0,"cart_discount":0,"tax_type":"NET","options":[]},{"id":552404952,"name":"Atlantic Salmon Sashimi 5pc","total_item_price":21.9,"price":10.95,"quantity":2,"instructions":"","type":"item","type_id":3265116,"tax_rate":0.05,"tax_value":1.095,"parent_id":null,"item_discount":0,"cart_discount_rate":0,"cart_discount":0,"tax_type":"NET","options":[]},{"id":552405001,"name":"Albacore Tuna Sashimi 5pc","total_item_price":21.5,"price":10.75,"quantity":2,"instructions":"","type":"item","type_id":3265117,"tax_rate":0.05,"tax_value":1.075,"parent_id":null,"item_discount":0,"cart_discount_rate":0,"cart_discount":0,"tax_type":"NET","options":[]},{"id":552405396,"name":"Tamago","total_item_price":7.4,"price":1.85,"quantity":4,"instructions":"","type":"item","type_id":3265161,"tax_rate":0.05,"tax_value":0.37,"parent_id":null,"item_discount":0,"cart_discount_rate":0,"cart_discount":0,"tax_type":"NET","options":[]},{"id":552405729,"name":"Green Halo","total_item_price":16.45,"price":16.45,"quantity":1,"instructions":"Extra serrano chilies please :)","type":"item","type_id":3247106,"tax_rate":0.05,"tax_value":0.8225,"parent_id":null,"item_discount":0,"cart_discount_rate":0,"cart_discount":0,"tax_type":"NET","options":[{"id":495973503,"name":"Atlantic","price":0,"group_name":"Salmon Type","quantity":1,"type":"option","type_id":3558546}]},{"id":552405858,"name":"Zesty Avalanche","total_item_price":16.45,"price":16.45,"quantity":1,"instructions":"","type":"item","type_id":5946419,"tax_rate":0.05,"tax_value":0.8225,"parent_id":null,"item_discount":0,"cart_discount_rate":0,"cart_discount":0,"tax_type":"NET","options":[{"id":495973581,"name":"Atlantic","price":0,"group_name":"Salmon Type","quantity":1,"type":"option","type_id":3558546}]},{"id":552405964,"name":"Passion Sunrise","total_item_price":14.75,"price":14.75,"quantity":1,"instructions":"","type":"item","type_id":3265083,"tax_rate":0.05,"tax_value":0.7375,"parent_id":null,"item_discount":0,"cart_discount_rate":0,"cart_discount":0,"tax_type":"NET","options":[{"id":495973643,"name":"Atlantic","price":0,"group_name":"Salmon Type","quantity":1,"type":"option","type_id":3558546}]},{"id":552406021,"name":"God of Wind","total_item_price":14.75,"price":14.75,"quantity":1,"instructions":"","type":"item","type_id":3265085,"tax_rate":0.05,"tax_value":0.7375,"parent_id":null,"item_discount":0,"cart_discount_rate":0,"cart_discount":0,"tax_type":"NET","options":[]},{"id":552406440,"name":"Avocado Roll","total_item_price":8.95,"price":8.95,"quantity":1,"instructions":"Cut small please :)","type":"item","type_id":3265110,"tax_rate":0.05,"tax_value":0.4475,"parent_id":null,"item_discount":0,"cart_discount_rate":0,"cart_discount":0,"tax_type":"NET","options":[]},{"id":552407118,"name":"Prawn Tempura","total_item_price":11.25,"price":11.25,"quantity":1,"instructions":"","type":"item","type_id":3267593,"tax_rate":0.05,"tax_value":0.5625,"parent_id":null,"item_discount":0,"cart_discount_rate":0,"cart_discount":0,"tax_type":"NET","options":[]}]}]}`;
var testQry = `{"query":"{isEntityExists(type:\"Customers\",name:\"Jennifer Dominie-+14038266041\")}"}`;

var lastBody;
var lastQryCompleted = true;

//writing to log for Gloriafood
function writeToLog(content){
    log.write("Gloria", content);
}

//starting GloriaFood integration app. will run an infinite loop, running the "loop" function
async function start(testing){
    if(testing)
        isTest = true;
	writeToLog("Gloria Started.\r\n\r\n\r\n");
    while(true){
	    await loop();
        await new Promise(r => setTimeout(r, timeout));
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
        writeToLog("ERROR: " + err.message);
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
    var customer = {
        firstName: order.client_first_name,
        lastName: order.client_last_name,
        email: order.client_email,
        phone: order.client_phone,
        address: order.client_address,
        newCustomer: false
    }
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