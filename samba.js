//The "API" for SambaPOS for this app.



module.exports = {isOpen, gql, updateGlobalSetting, getGlobalSetting, getOpenTickets, openTerminal, closeTerminal, payTicket, closeTicket, loadCustomer, loadItems, createTicket }; //Authorize, gql, getCloverLastRead, setCloverLastRead, getDeliverectLastRead, setDeliverectLastRead, getOpenTakeoutTickets,getOpenDeliveryTickets,openTerminal,closeTerminal,payTicket, closeTicket,loadCustomer,loadItems,createTicket, getCheckHoldOrders};

const request = require('request');
const querystring = require('querystring');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config();

const log = require('./log');
//const Server = require('./Server');
//const Webhook = require('./Webhook');
//const Clover = require('./Clover');
//const Gloria = require('./Gloria');
//const Deliverect = require('./Deliverect');

const server = process.env.MESSAGE_SERVER;
const messageServerPort = process.env.MESSAGE_SERVER_PORT;
const serverKey = process.env.SERVER_KEY;

const userName = process.env.USERNAME;
const password = process.env.PASSWORD;
const deliverectOrderTagName = process.env.DELIVERECT_ORDER_TAG_NAME;
const terminalName = 'Server';
const miscProductName = 'Misc';
const departmentName = 'Takeout';

var accessToken = undefined;
var accessTokenExpires = '';

const openTime = "10:30";
const closeTime = "22:00";

//will check if store is open.
//TODO:make a page that can edit the open times for each weekday so hours are not hard-coded.
function isOpen(){
    var date = new Date();
    var open = getTime(openTime);
    var close = getTime(closeTime);
    if(date.getDay() != 1 && date > open && date < close)
        return true;
    return false;
}
//get time according to input time.
//TODO: this will change once open time editing page is created.
function getTime(time){
    time = time.split(":");
    return new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), time[0], time[1]);
}


//Log for all SambaRequests
function writeToLog(content){
    log.write("Samba",content);
}

//write to log for Samba errors
function writeToErrorLog(content){
	log.write("Samba_Error", content);
}


//Retreive auth token and valid date from Samba.
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
                writeToErrorLog("Error while Authorizing: " + err.msg);
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
    }).catch(err => {writeToErrorLog("Request Data: " + JSON.stringify(reqData, undefined, 2));});
}

//GraphiQL query
async function gql(query) {
	if (!accessToken) {
        writeToLog('Valid access Token is needed to execute GQL calls.')
        await Authorize();
    } else if (accessTokenExpires < new Date()) {
        writeToLog('Access Token Expired. Re-authenticating...');
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
                writeToLog("GQL ERROR:  " + JSON.stringify(res.errors) + "\r\n\r\n");
                resolve(res.data);
            }
        });	
    });
}

//get Samba Program Setting Values
function getGlobalSetting(settingName){
    if(typeof settingName == undefined) return;
    let qry = `{getGlobalSetting(name:"${settingName}"){value}}`;
    return gql(qry).then(res => {
        console.log(res);
        return res.getGlobalSetting.value;
    });
}

//set Samba Program Setting Values
async function updateGlobalSetting(settingName, value, updateType){
    if(typeof settingName == undefined) return;
    value = typeof value == undefined ? '' : value;

    var newValue = "";

    if(updateType == undefined) newValue = value;
    else{
        let currentValue = await getGlobalSetting(settingName);
        if(updateType == 'decrease')
            newValue = parseFloat(currentValue) - value;
        else if (updateType == 'increase')
            newValue = parseFloat(currentValue) + value;
    }
    let qry = `mutation update{setting: updateGlobalSetting(name:"${settingName}", value: "${newValue}"){value}}`;
    console.log(qry);
    return gql(qry).then(res => {
        return res.setting.value;
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



//Retreiving all currently open delivery tickets
function getOpenDeliveryTickets(){
    return getOpenTickets().then(tickets => {
        return tickets.filter(ticket =>
            ticket.type == 'Delivery Ticket');
        });
}

//retreiving all currently open tickets that are not on hold (state is "Unpaid"). sorted by pickup time.
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

//register a GQL terminal
function openTerminal(){
	return gql(getOpenTerminalScript())
		.then(data => data.registerTerminal);
}

//load a ticket, make payments, and close ticket.
function payTicket(terminalId, ticketId, amount, paymentType){
	return loadTicket(terminalId,ticketId).then( () => {
        return payLoadedTicket(terminalId, amount, paymentType).then( resolve => {
            return closeTicket(terminalId).then( data =>{
                if(data == "Ticket changed. Your latest changes not saved.")
                    return false;
                else   
                    return true;
            }, err => false);
        }, err => false);
    });
}

//loads a ticket to the specified terminal
function loadTicket(terminalId, ticketId){
	return gql(getLoadTicketScript(terminalId,ticketId));
}
//pays a specified amount on the loaded ticket on the specified terminal.
function payLoadedTicket(terminalId, amount, paymentType){
	return gql(getPayTicketScript(terminalId, amount, paymentType));
}

//close ticket
function closeTicket(terminalId){
    return gql(getCloseTicketScript(terminalId));
}

//unregister gql terminal
function closeTerminal(terminalId){
	return gql(getCloseTerminalScript(terminalId));
}

//Send an event message
function broadcast(msg){
    return gql(getPostBroadcastScript(msg));
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
	return `mutation payCommand{ executeAutomationCommandForTerminalTicket(terminalId:"${terminalId}" name:"Auto Paid By Card" value:"${amount}"){id}}`;
}

function getCloseTicketScript(terminalId){
	return `mutation close {closeTerminalTicket(terminalId:"${terminalId}") }`;
}

function getPostBroadcastScript(msg){
	return `mutation broadcast {postBroadcastMessage(message:"${msg}"){message} }`;
}


function getCloseTerminalScript(terminalId){
	return `mutation unregister {unregisterTerminal(terminalId: "${terminalId}")}`;
}

//load items from SambaPOS and return an item object.
function loadItems(items) {
    var script = getLoadItemsScript(items);
    return gql(script)
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
//creating a SambaPOS ticket from customer, items, ticket note, fulfilment time, service fees, and ticekt type
function createTicket(customer, items, instructions, pickupTime, services, type) {
    return gql(getAddTicketScript(items, customer, instructions, pickupTime, services, type))
		.then( data => {
            var ticketId = data.addTicket.id;
            gql('mutation m {postTicketRefreshMessage(id:0){id}}');
            writeToLog(`Ticket ${ticketId} created...`);
		    return (ticketId);
		});
}

//load customer from SambaPOS
function loadCustomer(customer, phone) {
	return gql( getIsEntityExistsScript(customer) )
		.then( async data => {
			if (!data.isEntityExists)
				return createCustomer(customer);
			else {
                let sambaCustomer = await getCustomer(customer);
                console.log(sambaCustomer);
                if(phone && sambaCustomer.customData.findIndex(index => index.value == phone) == -1){
                    return updateCustomerPhone(customer, phone);
                }
				return sambaCustomer;
            }
		});
}

//create a new customer on SambaPOS
function createCustomer(customer) {
    return gql(getAddCustomerScript(customer))
		.then( data => {
			gql(getNewCustomerStateScript(customer));
			return getCustomer(customer);
		});
}

//retreive a customer from SambaPOS
function getCustomer(customer) {
    return gql(getCustomerScript(customer))
		.then( data => {
			return data.getEntity;
		});
}

//Fix customer phone number
function updateCustomerPhone(customer, phone){
    return gql(getUpdateCustomerPhoneScript(customer, phone))
        .then(data => data.updateEntityCustomData);
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

//Building GQL script to update customer phone number.
function getUpdateCustomerPhoneScript(customer, phone){
    return `mutation updatePhone{updateEntityCustomData(entityTypeName:"${customer.type}", 
    entityName:"${customer.name}",
    name:"Phone",
    value: "${phone}"
  ){type,name,customData{name,value},states{stateName,state}}}`;
}

//Build order tags to SambaPOS format.
function GetOrderTags(order) {
    if (order.options) {
        let options = [];
		if(order.sambaName === miscProductName){
			options.push(`{tagName:"Item Name",tag:"${order.name}"}`);
		}
        options = options.concat(order.options.map(x => {
			if(x.group_name.includes("Salmon Type"))
			{
				if(x.name.includes("Sockeye"))
					return `{tagName:"Salmon Type", tag:"Sal > Sockeye", price:${x.price}, quantity:${x.quantity}}`;
				else return;
			}
			else if(x.group_name === "Rolls")
				return `{tagName:"Combo Rolls", tag:"${x.name}", price:${x.price}, quantity:${x.quantity}}`;
            else if(x.group_name == deliverectOrderTagName)
                return `{tagName:"${deliverectOrderTagName}", tag:"${x.name}", price:${x.price}, quantity:${x.quantity}}`;
			return `{tagName:"Default", tag:"${x.group_name}:${x.name}", price:${x.price}, quantity:${x.quantity}}`;}));
        if (order.instructions && order.instructions !== '') {
			order.instructions = order.instructions.replace(/\n/g, '  ');
            options.push(`{tagName:"Default", tag:"Instructions: ${order.instructions}"}`);
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
//Building GQL script to add new tickets. Will take orders, customers, instructions, pickup time, service charges, and ticket type as arguments.
function getAddTicketScript(orders, customer, instructions, pickupTime, services, type) {
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

    var entityPart = customer
        ? `entities:[{entityType:"${customer.type}",name:"${customer.name}"}],`:'';
    var calculationsPart = services
        ? `calculations:[${services.map(x => `{name:"${x.name}",amount:${x.amount}}`).join()}],`
        : '';
    if( !(pickupTime instanceof Date) ){
        pickupTime = new Date(pickupTime);
	}
    var coeff = 1000 * 60 * 5;
    var pickupDate = new Date(Math.round(pickupTime.getTime() / coeff) * coeff);
	var time = `${date.getHours()}:${pickupTime.getMinutes()<10?"0"+ pickupTime.getMinutes():pickupTime.getMinutes()}`;
	
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
					${pickupDate.getDate() != new Date().getDate() ?',{stateName:"Pickup Status",state:"Future"}':''}],
                tags:[{tagName:"Pickup Date",tag:"${pickupDate.getMonth() + 1}/${pickupDate.getDate()}/${pickupDate.getFullYear()}"},{tagName:"Pickup Time", tag:"${time}"}],
                ${calculationsPart}
                orders:[${orderLines.join()}]
            }){id}}`;
} 


//Check Hold Orders
function getCheckHoldOrders(){
    return gql(getCheckHoldOrdersScript());
}
//Check Hold Orders Script
function getCheckHoldOrdersScript(){
    return `mutation check {executeAutomationCommand(name:"Test" terminal:"Server" event:"" department:"Takeout" user:"Admin" ticketType:"Gloria Ticket")}`;
    //return `mutation check {executeAutomationCommand(name:"Check Hold Orders" terminal:"Server" department:"Takeout" user:"Admin" ticketType:"Gloria Ticket")}`;
}