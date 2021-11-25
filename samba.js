module.exports = {Authorize, gql, getCloverLastRead, setCloverLastRead, getDeliverectLastRead, setDeliverectLastRead, getOpenTakeoutTickets,getOpenDeliveryTickets,openTerminal,closeTerminal,payTicket, closeTicket,loadCustomer,loadItems,createTicket};

const request = require('request');
const querystring = require('querystring');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config();

const log = require('./log');
const Server = require('./Server');
const Webhook = require('./Webhook');
const Clover = require('./Clover');
const Gloria = require('./Gloria');
const Deliverect = require('./Deliverect');

const server = process.env.MESSAGE_SERVER;
const messageServerPort = process.env.MESSAGE_SERVER_PORT;
const serverKey = process.env.SERVER_KEY;
const customerEntityType = 'Customers';

const userName = process.env.USERNAME;
const password = process.env.PASSWORD;
const terminalName = 'Server';
const miscProductName = 'Misc';

var accessToken = undefined;
var accessTokenExpires = '';


const isTest = false;

//Log for all SambaRequests
function writeToLog(content){
    log.write("Samba",content);
}


//Retreice auth token and valid date from Samba.
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

//GraphiQL query
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
        request(reqData, async function (err, res, body) {
            if (res.statusCode === 401) {
                writeToLog('Should Authorize...');
                await Authorize();
                resolve(await gql(query));
            }
            else {
                let res = JSON.parse(body);
                writeToLog("GQL QUERY : " + JSON.stringify(query, undefined,2));
                writeToLog("GQL Result: " + JSON.stringify(res.data, undefined, 2));
                writeToLog("GQL ERROR:  " + JSON.stringify(res.errors));
                resolve(res.data);
            }
        });	
    });
}

//Retreiving value for when clover was last polled
function getCloverLastRead(delay){
    let qry = `{getGlobalSetting(name:"lastCloverCheck"){value}}`;
    return gql(qry)
        .then( resp =>{
			let date = new Date(resp.getGlobalSetting.value);
            if(delay)
			    date.setMinutes(date.getMinutes() - delay);
            return date;
        })
}

//Setting value for when clover was last polled
function setCloverLastRead(date){
	if(!date)
		date = new Date();
    let qry = `mutation m{updateGlobalSetting(name:"lastCloverCheck", value:"${date.toJSON()}"){value}}`;
    return gql(qry)
        .then( () =>{
            return true;
        });
}
//Retreiving value for when deliverect was last polled
function getDeliverectLastRead(delay){
    let qry = `{getGlobalSetting(name:"lastDeliverectCheck"){value}}`;
    return gql(qry)
        .then( resp =>{
			let date = new Date(resp.getGlobalSetting.value);
            if(delay)
			    date.setMinutes(date.getMinutes() - delay);
            return date;
        })
}

//Setting value for when deliverect was last polled
function setDeliverectLastRead(date){
	if(!date)
		date = new Date();
    let qry = `mutation m{updateGlobalSetting(name:"lastDeliverectCheck", value:"${date.toJSON()}"){value}}`;
    return gql(qry)
        .then( () =>{
            return true;
        });
}

//Retreiving all currently all open takeout tickets
function getOpenTakeoutTickets(){
    return getOpenTickets().then(tickets => {
        return tickets.filter(ticket =>
            ticket.type != 'Delivery Ticket');
        });
}

//Retreiving all currently open delivery tickets
function getOpenDeliveryTickets(){
    return getOpenTickets().then(tickets => {
        return tickets.filter(ticket =>
            ticket.type == 'Delivery Ticket');
        });
}

//retreiving all currently open tickets.
function getOpenTickets(){
	return gql(getOpenTicketsScript())
		.then(tickets =>{
			tickets = tickets.getTickets.filter(ticket =>
				ticket.states.filter(state => state.state == "Unpaid").length != 0
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

///register a gql terminal
function openTerminal(){
	return gql(getOpenTerminalScript())
		.then(data => data.registerTerminal);
}

//load a ticket, make payments, and close ticket.
async function payTicket(terminalId, ticketId, amount, paymentType){
	await gql(getLoadTicketScript(terminalId,ticketId));
    if(!amount instanceof Array)
        amount = [amount];
    for(let i in amount)
        await gql(getPayTicketScript(terminalId, amount, paymentType));
    await closeTicket(terminalId);
}

//close ticket
function closeTicket(terminalId){
    return gql(getCloseTicketScript(terminalId));
}

//unregister gql terminal
function closeTerminal(terminalId){
	return gql(getCloseTerminalScript(terminalId));
}

function getOpenTicketsScript(){
	return `{getTickets(isClosed: false) {id, type, remainingAmount, states{state, stateName}, tags{tag, tagName}, entities{name}}}`;
}

function getOpenTerminalScript(){
	return `mutation register {registerTerminal(user: "Server", ticketType: "Ticket", terminal: "Server", department: "Restaurant") }`;
}

function getLoadTicketScript(terminalId, ticketId){
	return `mutation load {loadTerminalTicket(terminalId: "${terminalId}", ticketId: "${ticketId}") { id } }`;
	
}

function getPayTicketScript(terminalId, amount, paymentType){
	return `mutation pay {payTerminalTicket(terminalId:"${terminalId}", paymentTypeName:"${paymentType}", amount:${amount}){ ticketId} }`;
}

function getCloseTicketScript(terminalId){
	return `mutation close {closeTerminalTicket(terminalId:"${terminalId}") }`;
}

function getPostBroadcastScript(list){
	list = JSON.stringify(list).replace(/["]/g, "\\\"");
	return `mutation broadcast {postBroadcastMessage(message:"${list}"){message} }`;
}


function getCloseTerminalScript(terminalId){
	return `mutation unregister {unregisterTerminal(terminalId: "${terminalId}")}`;
}

//load items from SambaPOS and return an item object.
function loadItems(items) {
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
//creating a SambaPOS ticket from customer, items, ticket note, fulfilment time, service fees, and ticekt type
function createTicket(customer, items, instructions, fulfill_at, services, type) {
    return gql(getAddTicketScript(items, customer.name, instructions, fulfill_at, services, type))
		.then( data => {
            var ticketId = data.addTicket.id;
            gql('mutation m {postTicketRefreshMessage(id:0){id}}');
            writeToLog(`Ticket ${ticketId} created...`);
		    return (ticketId);
		});
}

//load customer from SambaPOS
function loadCustomer(customer) {
	return gql( getIsEntityExistsScript(customer) )
		.then( data => {
			if (!data.isEntityExists)
				return createCustomer(customer);
			else 
				return getCustomer(`${customer.firstName} ${customer.lastName}-${customer.phone	}`);
		});
}

//create a new customer on SambaPOS
function createCustomer(customer) {
    return gql(getAddCustomerScript(customer))
		.then( data => {
			gql(getNewCustomerStateScript(customer));
			return getCustomer(data.addEntity.name);
		});
}

//retreive a customer from SambaPOS
function getCustomer(customerName) {
    return gql(getCustomerScript(customerName))
		.then( data => {
			return data.getEntity;
		});
}

//script for retreiving items from SambaPOS
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
            ticket:{type:"${type}",
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