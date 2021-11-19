const express = require('express');
const http = require('http');
const request = require('request');
const querystring = require('querystring');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config();

const messageServer = process.env.MESSAGE_SERVER;
const messageServerPort = process.env.MESSAGE_SERVER_PORT;
const serverKey = process.env.SERVER_KEY;
const timeout = 2000;
const customerEntityType = 'Customers';
const itemTagName = 'Gloria Name';
const ticketType = 'Delivery Ticket';
const departmentName = 'Takeout';
const userName = process.env.USERNAME;
const Password = process.env.PASSWORD;
const terminalName = 'Server';
const miscProductName = 'Misc';
const deliveryFeeCalculation = 'Delivery Service';
const promotionDiscount = 'Discount';
const tipCalculation = 'Tip';
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
	"1":{entityType:6, constructor: Skip},
	"0":{entityType:7, constructor: Door}
};

var Skip = (data) => {
	this.name = data.orderId.substr(data.orderId.length - 5);
	this.subData = `,customData:[{name:"Name",value:"${data.name}"}]`;
}

var Door = (data) => {
	this.name = data.name;
	this.subData = '';
}


start();

var lastBody;
var lastQryCompleted = true;

async function start(){
	http.createServer((req, res) => {
		let {headers, method, url} = req;
		let body = "";
		let orderId = [];
		req.on('error', err => {
			console.error(err);
		}).on('data', chunk => {
			body += chunk;
		}).on('end', () => {
			body = JSON.parse(body);
			console.log(body);

			//orderId = body["_items"]["_id"];
			//body = Buffer.concat(body).toString();
		});
		res.setHeader('Content-Type', 'application/json');
		res.end(`{"posOrderId": "${orderId}"}`)
	}).listen(8000);
	return;

	writeToLog("\r\n\r\n\r\n\r\nDeliverect Reader Started");
	await Authorize();
    var date = new Date();
    setLastRead(date)
        .then( resp => {
            if(resp) getLastRead()
                .then(lastRead => {console.log(lastRead)})});
	//loop();
}

function writeToLog(content)
{
	//var date = new Date();
	//date = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 19).replace('T', ', ') + ":" + date.getMilliseconds();
	if(typeof content == "Object")
	 	content = JSON.stringify(content);
//var functionName = arguments.callee.caller.toString();
	//functionName = '';
	fs.writeFile('test_data.json', content.toString(), (err) => {if(err) console.log(err);});
	
	console.log(content);
	return;
	if(isTest)
		console.log(content);
	else
		fs.appendFile('C:\\Users\\USER\\Documents\\SambaPOS5\\GloriaTakeout\\log.txt', `${date}: ${content}\r\n`,(err) => {if(err) throw err; console.log(`${content}\r\n`);})
	
}


function makeRequest(reqData){
	return new Promise((resolve, reject)=>{
		request(reqData, (err, res, body)=> {
			
			if(!err){
				var returnData = {
					body : body,
					statusCode : res.statusCode
				}
				resolve(returnData);
			}
			else{
				reject(err);
			}
		})
	})
	.catch((err) => {
		writeToLog("ERROR: " + err.message);
	});
}


async function Authorize(callback) {
    accessToken = undefined;
	writeToLog("authorizing");
    var form = { grant_type: 'client_credentials', client_secret: serverKey, client_id: 'gloria' };
    var formData = querystring.stringify(form);
    var contentLength = formData.length;
    var reqData = {
        headers: {
            'Content-Length': contentLength,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        uri: 'http://' + messageServer + ':' + messageServerPort + '/Token',
        body: formData,
        method: 'POST'
    };
	var returnData = await makeRequest(reqData);
	if(returnData.statusCode == 400)
		writeToLog(returnData.body);
	else{
		var result = JSON.parse(returnData.body);
		accessToken = result.access_token;
		accessTokenExpires = new Date(result['.expires']);
		writeToLog("Access Token Authorized.");
	}
	return returnData;
}

async function processPOST(data) {
    if (!accessToken) {
        writeToLog('There is no valid access token. Skipping...')
        await Authorize();
		if(!lastQryCompleted)
			processTickets(lastBody);
    }
    else if (accessTokenExpires < new Date()) {
        writeToLog('Access Token Expired. Reauthenticating...');
        await Authorize();
    }
    else {
        processTickets(data);
		
		//var qry = `getProduct(name: "Sappoo") {name}`;
		//gql(qry,() =>{return});
    }
}

async function gql(query, callback) {
	if (!accessToken) {
        writeToLog('Valid access Token is needed to execute GQL calls.')
        return;
    }
	
    var data = JSON.stringify({ query: query });
	var returnData;
	if(!isTest)
		writeToLog("GQL Query: " + data);
   var reqData = {
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': 'Bearer ' + accessToken
        },
        uri: 'http://' + messageServer + ':' + messageServerPort + '/api/graphql',
        body: data,
        method: 'POST'
    }
	var returnData = await makeRequest(reqData);
	//console.log("returnData: ",returnData);
	if(returnData.statusCode === 401){
		writeToLog('Should Authorize...');
		await Authorize();
		returnData = await gql(query);
	}
	else{
		var data = JSON.parse(returnData.body).data;
		if(isTest)
			writeToLog(`GQL Query: ${query}\r\nResponse:\r\n${returnData.body}\r\n`);
		returnData = data;
	}
	return returnData;
	
}

function getLastRead(){
    var qry = `{getGlobalSetting(name:"lastDeliverectCheck"){value}}`;
    return gql(qry)
        .then( resp =>{
            return new Date(resp.getGlobalSetting.value);
        })
}

function setLastRead(date){
    var qry = `mutation m{updateGlobalSetting(name:"lastDeliverectCheck", value:"${date.toJSON()}"){value}}`;
    return gql(qry)
        .then( () =>{
            return true;
        });
}
function processTickets(tickets) {
    if (tickets["_meta"].total == 0) return;
    tickets["_items"].forEach((order) => processOrder(order));
}

async function processOrder(order) {
	if(isTest)
	{
		writeToLog("Line 140: processOrder\r\n" + JSON.stringify(order) + "\r\n\r\n");
	}
    var orderData = {
        name: order.customer.name,
        phone: order.customer.phoneNumber,
		company: channels[order.channel],
		orderId: order.channelOrderId,
		time: new Date(order.pickupTime)
    }
	
    customer = await createCustomer(orderData);
	var services = order.items
	   .filter(x => x.type === 'tip' || x.type === 'delivery_fee' || x.type === 'promo_cart')
		.filter(x => x.name)
	   .map(x => { return { name: getCalculationName(x.type), amount: Math.abs((x.cart_discount_rate) * 100) || x.price}; }) 
	loadItems(order.items.map(x => processItem(x)))
		.then( items => {
			createTicket(customer, items, order.instructions, order.fulfill_at, services)
				.then( ticketId => {
					gql('mutation m {postTicketRefreshMessage(id:0){id}}');
					writeToLog(`Ticket ${ticketId} created...`);
					lastQryCompleted = true;
				});
			
		});
	return;
	var ticketId = await createTicket(customer, items, order.instructions, order.fulfill_at, services);
	gql('mutation m {postTicketRefreshMessage(id:0){id}}');
	writeToLog(`Ticket ${ticketId} created...`);
	lastQryCompleted = true;
}

function getCalculationName(name) {
    if (name === 'promo_cart') return promotionDiscount;
    if (name === 'tip') return tipCalculation;
    if (name === 'delivery_fee') return deliveryFeeCalculation;
    return undefined;
}

function loadItems(items) {
	if(isTest)
	{
		writeToLog("Line 175: loadItems\r\n" + JSON.stringify(items) + "\r\n\r\n");
	}
    var script = getLoadItemsScript(items);
    return gql(script)
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


function createTicket(customer, items, instructions, fulfill_at, services) {
	if(isTest)
	{
		writeToLog("Line 214: createTicket Item check\r\n" + JSON.stringify(items, undefined, 2) + "\r\n\r\n");
	}
    var newCustomer = isNewCustomer(customer);
    return gql(getAddTicketScript(items, customer.name, newCustomer, instructions, fulfill_at, services))
		.then( data => {
		return (data.addTicket.id);
		});
}


function createCustomer(customer) {
    return gql(getAddCustomerScript(customer))
		.then( data => {
			gql(getNewCustomerStateScript(customer));
			return getCustomer(data.addEntity.name);
		});
}

function getCustomer(customerName) {
    return gql(getCustomerScript(customerName))
		.then( data => {
			return data.getEntity;
		});
}

function getLoadItemsScript(items) {
    var part = items.map(item => `i${item.id}: getProduct(name:"${item.name}"){name, groupCode} `);
    return `{${part}}`;
}


function getAddCustomerScript(data) {
	returnData = data.company.constructor(data);
    return `
    mutation m{addEntity(entity:{
        entityType:"${data.company.entityType}",name:"${returnData.name}"${returnData.subData}})
        {name}
    }`;
}

function getNewCustomerStateScript(customer) {
    return `mutation m{updateEntityState(entityTypeName:"${customerEntityType}",entityName:"${customer.firstName} ${customer.lastName}-${customer.phone}",state:"Unconfirmed",stateName:"CStatus"){name}}`;
}

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
            options.push(`{tagName:"Default",tag:"Instructions: ${order.instructions}"}`);
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

function GetPortions(order) {
    if (order.portions.length != 0) {
		var portions = order.portions.map(x => `portion:"${x.name}",` );
        var result = portions.join();
        return `${result}`
    } 
    return "";  
}

function GetOrderPrice(order) {
	if(order.portions.length !=0){
		var price = order.portions.map(x => `price:${Math.abs((x.price) + (order.price))},`);
        var result = price.join();
        return `${result}`;
        }
	return `price:${order.price},`;
}

function getAddTicketScript(orders, customerName, newCustomer, instructions, fulfill_at, services) {
	if(isTest)
	{
		writeToLog("Line311: getAddTicketScript\r\n" + JSON.stringify(orders, undefined, 2) + "\r\n\r\n");
	}
	console.log(fulfill_at);
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

    var entityPart = customerName
        ? `entities:[{entityType:"${customerEntityType}",name:"${customerName}"}],`:'';
    var calculationsPart = services
        ? `calculations:[${services.map(x => `{name:"${x.name}",amount:${x.amount}}`).join()}],`
        : '';
	
	var coeff = 1000 * 60 * 5;
	var date = new Date(fulfill_at);
	date = new Date(Math.round(date.getTime() / coeff) * coeff);
	
	var time = `${date.getHours()}:${date.getMinutes()<10?"0"+ date.getMinutes():date.getMinutes()}`;
	
    var result = `
        mutation m{addTicket(
            ticket:{type:"${ticketType}",
                department:"${departmentName}",
                user:"${userName}",
                terminal:"${terminalName}",
                ${entityPart}
                states:[
                    {stateName:"Status",state:"Unconfirmed"}
					${date.getDate() != new Date().getDate() ?',{stateName:"Pickup Status",state:"Future"}':''}],
                tags:[{tagName:"Pickup Date",tag:"${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}"},{tagName:"Pickup Time", tag:"${time}"}],
                ${calculationsPart}
                orders:[${orderLines.join()}]
            }){id}}`;
	createTicketQry = result;
	if(isTest)
	{
		writeToLog("Line 348: getAddTicketScript:\r\n" + result + "\r\n\r\n");
	}
    return result;
} 

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