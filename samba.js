module.exports = {writeToLog,Authorize,gql,getLastRead, setLastRead,getOpenTicekts,openTerminal,closeTerminal,payTicket,loadCustomer,loadItems,createTicket};

const express = require('express');
const http = require('http');
const request = require('request');
const querystring = require('querystring');
const { resolve } = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config();

const Server = require('./Server');
const Webhook = require('./Webhook');
const Clover = require('./Clover');

const server = process.env.MESSAGE_SERVER;
const messageServerPort = process.env.MESSAGE_SERVER_PORT;
const serverKey = process.env.SERVER_KEY;
const timeout = 2000;
const customerEntityType = 'Customers';
const itemTagName = 'Gloria Name';
const deliveryTicketType = 'Delivery Ticket';
const takeoutTicketType =  'Gloria Ticket';
const deliveryDepartmentName = 'Delivery';
const takeoutDepartmentName = 'Takeout';
const userName = process.env.USERNAME;
const password = process.env.PASSWORD;
const terminalName = 'Server';
const miscProductName = 'Misc';
var accessToken = undefined;
var accessTokenExpires = '';


const isTest = false;

start();

async function start(){
    console.log("====================================================================================");
    Server.start();
    Webhook.start();
    await Authorize();
    //let a = await gql(getOpenTicekts());
    //console.log(JSON.stringify(a,undefined,2));
}


function writeToLog(content){
	var date = new Date();
	date = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 19).replace('T', ', ') + ":" + date.getMilliseconds();
	if(typeof content == "Object")
	 	content = JSON.stringify(content);
	console.log(content);
	fs.appendFile('log.txt', `${date}: ${content}\r\n`,(err) => {if(err) throw err; console.log(`${content}\r\n`);})
}

async function Authorize() {
    accessToken = undefined;
	writeToLog("Authorizing.");
    let form = { grant_type: 'client_credentials', client_secret: serverKey, client_id: 'gloria' };
    let formData = querystring.stringify(form);
    let contentLength = formData.length;
    let reqData = {
            headers: {
                'Content-Length': contentLength,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            uri: 'http://' + server + ':' + messageServerPort + '/Token',
            body: formData,
            method: 'POST'
        };
    return new Promise((resolve, reject)=>{
        request(reqData, (err, res, body) =>{
            if(err){
                writeToLog("Error while Authorizing: " + err.msg);
                reject();
            }
            else if(res.statusCode === 400){
                writeToLog("ERROR 400 BAD REQUEST: " + body);
                reject()
            } else{
                var result = JSON.parse(body);
                accessToken = result.access_token;
                accessTokenExpires = new Date(result['.expires']);
                writeToLog("Token Valid until: " + accessTokenExpires.toString());
                resolve();
            }
        });
    }).catch(err => {writeToLog("Request Data: " + JSON.stringify(reqData, undefined, 2));});
}

async function gql(query) {
	if (!accessToken) {
        writeToLog('Valid access Token is needed to execute GQL calls.')
        await Authorize();
    } else if (accessTokenExpires < new Date()) {
        writeToLog('Access Token Expired. Reauthenticating...');
        await Authorize();
    }
	
    let data = JSON.stringify({ query: query });
   let reqData = {
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': 'Bearer ' + accessToken
        },
        uri: 'http://' + server + ':' + messageServerPort + '/api/graphql',
        body: data,
        method: 'POST'
    }
    return new Promise((resolve, reject) =>{
        request({
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + accessToken
            },
            uri: 'http://' + server + ':' + messageServerPort + '/api/graphql',
            body: data,
            method: 'POST'
        }, async function (err, res, body) {
            if (res.statusCode === 401) {
                writeToLog('Should Authorize...');
                await Authorize();
                resolve(await gql(query));
            }
            else {
                let res = JSON.parse(body).data;
                writeToLog("GQL Result: " + JSON.stringify(res, undefined, 2));
                resolve(res);
            }
        });	
    });
}

function getLastRead(){
    let qry = `{getGlobalSetting(name:"lastCloverCheck"){value}}`;
    return gql(qry)
        .then( resp =>{
			let date = new Date(resp.getGlobalSetting.value);
			date.setMinutes(date.getMinutes() - (10 + (timeout / 60000)));
            return date;
        })
}

function setLastRead(date){
	if(!date)
		date = new Date();
    let qry = `mutation m{updateGlobalSetting(name:"lastCloverCheck", value:"${date.toJSON()}"){value}}`;
    return gql(qry)
        .then( () =>{
            return true;
        });
}

function getOpenTicekts(){
	return gql(getOpenTicketsScript())
		.then(tickets =>{
			tickets = tickets.getTickets.filter(ticket =>
				ticket.type != 'Delivery Ticket' && ticket.states.filter(state => state.state == "Unpaid").length != 0
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
			return tickets;
		});
}

function openTerminal(){
	return gql(getOpenTerminalScript())
		.then(data => data.registerTerminal);
}

function payTicket(terminalId, ticketId, amount){
	return gql(getLoadTicketScript(terminalId,ticketId))
		.then( () => {
			return gql(getPayTicketScript(terminalId, amount))
				.then( () => {
					return gql(getCloseTicketScript(terminalId))
				});
		});
}

function payTickets(list){
	return gql(getPostBroadcastScript(list))
		.then( msg => msg);
}



function closeTerminal(terminalId){
	return gql(getCloseTerminalScript(terminalId));
}

function getOpenTicketsScript(){
	return `{getTickets(isClosed: false) {
    id
    type
    remainingAmount
    states {
      state
      stateName
    }
	tags {
      tag
      tagName
    }
	}}`;
}

function getOpenTerminalScript(){
	return `mutation register {registerTerminal(user: "Server", ticketType: "Ticket", terminal: "Server", department: "Restaurant") }`;
}

function getLoadTicketScript(terminalId, ticketId){
	return `mutation load {loadTerminalTicket(terminalId: "${terminalId}", ticketId: "${ticketId}") { id } }`;
	
}

function getPayTicketScript(terminalId, amount){
	return `mutation pay {payTerminalTicket(terminalId:"${terminalId}", paymentTypeName:"Credit Card", amount:${amount}){ ticketId} }`;
}

function getCloseTicketScript(terminalId){
	return `mutation close {closeTerminalTicket(terminalId:"${terminalId}"){ ticketId} }`;
}

function getPostBroadcastScript(list){
	list = JSON.stringify(list).replace(/["]/g, "\\\"");
	return `mutation broadcast {postBroadcastMessage(message:"${list}"){message} }`;
}


function closeTerminalScript(terminalId){
	return `mutation unregister {unregisterTerminal(terminalId: "${terminalId}")}`;
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
loadItems,createTicket,
function isNewCustomer(customer) {
    if (customer.states && customer.states.find(x => x.stateName === 'CStatus')) {
        return customer.states.find(x => x.stateName === 'CStatus').state === 'Unconfirmed';
    }
    return false;
}

function createTicket(customer, items, instructions, fulfill_at, services) {
	if(isTest)
	{
		writeToLog("Line 214: createTicket Item check\r\n" + JSON.stringify(items, undefined, 2) + "\r\n\r\n");
	}
    return gql(getAddTicketScript(items, customer.name, instructions, fulfill_at, services))
		.then( data => {
            var ticketId = data.addTicket.id;
            gql('mutation m {postTicketRefreshMessage(id:0){id}}');
            writeToLog(`Ticket ${ticketId} created...`);
		    return (ticketId);
		});
}

function loadCustomer(customer) {
	return gql( getIsEntityExistsScript(customer) )
		.then( data => {
			if (!data.isEntityExists)
				return createCustomer(customer);
			else 
				return getCustomer(`${customer.firstName} ${customer.lastName}-${customer.phone	}`);
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

function getCustomerScript(name) {
    return `{getEntity(type:"${customerEntityType}",name:"${name}"){name,customData{name,value},states{stateName,state}}}`;
}

function getIsEntityExistsScript(customer) {
    return `{isEntityExists(type:"${customerEntityType}",name:"${customer.firstName} ${customer.lastName}-${customer.phone}")}`;
}

function getAddCustomerScript(customer) {
    return `
    mutation m{addEntity(entity:{
        entityType:"${customerEntityType}",name:"${customer.firstName} ${customer.lastName}-${customer.phone}",customData:[
            {name:"First Name",value:"${customer.firstName}"},
            {name:"Last Name",value:"${customer.lastName}"},
            {name:"Address",value:"${customer.address}"},
            {name:"EMail",value:"${customer.email}"},
            {name:"Phone",value:"${customer.phone}"}
        ]})
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

function getAddTicketScript(orders, customerName, instructions, fulfill_at, services, type) {
	if(isTest)
	{
		writeToLog("Line311: getAddTicketScript\r\n" + JSON.stringify(orders, undefined, 2) + "\r\n\r\n");
	}
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
	
    return `
        mutation m{addTicket(
            ticket:{type:"${type=='Gloria'?takeoutTicketType:deliveryTicketType}",
                department:"${departmentName}",
                user:"${userName}",
                terminal:"${terminalName}",
                note:"${instructions !== null ? instructions : ''}",
                ${entityPart}
                states:[
                    {stateName:"Status",state:"Unconfirmed"}
					${date.getDate() != new Date().getDate() ?',{stateName:"Pickup Status",state:"Future"}':''}],
                tags:[{tagName:"Pickup Date",tag:"${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}"},{tagName:"Pickup Time", tag:"${time}"}],
                ${calculationsPart}
                orders:[${orderLines.join()}]
            }){id}}`;
} 
