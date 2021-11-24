module.exports = {processDeliverect};

const http = require('http');
const samba = require('./Samba');
const sql = require('./sql');
const log = require('./log');
const dotenv = require('dotenv');
dotenv.config();

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

function processDeliverect(data) {
	if (tickets["_meta"].total == 0 ) return;
    tickets["_items"].forEach((order) => {
		if(order.status == 20)
			processOrder(order);
		else if(order.status == 100)
			cancelOrder(order);
		else if(order.status == 90)
			finalizeOrder(order)
		
	});
}

async function processOrder(order) {
    var orderData = {
		id: order["_id"],
        name: order.customer.name,
        phone: order.customer.phoneNumber,
		company: channels[order.channel],
		channelId: order.channelOrderId,
		channelDisplayId: order.channelOrderDisplayId,
		time: new Date(order.pickupTime),
		note: order.note,
		decimalDigits: order.decimalDigits
    }
	orderData.entity = channels[order.channel].constructor(orderData);
	if(order.note)
		order.note = order.note.replace(/\\"/g,`\\\\"`);
	var customer = await createCustomer(orderData);
	
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

async function cancelOrder(order){
	return;
}

function finalizeOrder(order){
	return;
}

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


function createTicket(customer, items, instructions, fulfill_at, services) {
	if(isTest)
	{
		writeToLog("Line 214: createTicket Item check\r\n" + JSON.stringify(items, undefined, 2) + "\r\n\r\n");
	}
    return gql(getAddTicketScript(items, customer.name, instructions, fulfill_at, services))
		.then( data => {
		return (data.addTicket.id);
		});
}


function createCustomer(customer) {
    return gql(getAddCustomerScript(customer))
		.then( data => {
			if(!data)
				data = {addEntity:{name:customer.entity.name, type:customer.company.entityType}};
			else
				gql(getNewCustomerStateScript(data.addEntity));
			return getCustomer(data.addEntity);
		});
}

function getCustomer(customer) {
    return gql(getCustomerScript(customer))
		.then( data => {
			return data.getEntity;
		});
}

function getLoadItemsScript(items) {
    var part = items.map(item => `i${item.id}: getProduct(name:"${item.name}"){name, groupCode} `);
    return `{${part}}`;
}

function getCustomerScript(data) {
    return `{getEntity(type:"${data.type}",name:"${data.name}"){name,customData{name,value},states{stateName,state}}}`;
}

function getAddCustomerScript(data) {
    return `
    mutation m{addEntity(entity:{
        entityType:"${data.company.entityType}",name:"${data.entity.name}"${data.entity.subData}})
        {name 
		type}
    }`;
}

function getNewCustomerStateScript(customer) {
    return `mutation m{updateEntityState(entityTypeName:"${customer.type}",entityName:"${customer.name}",state:"Unconfirmed",stateName:"CStatus"){name}}`;
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

function getAddTicketScript(orders, customerName, instructions, fulfill_at, services) {
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
        mutation m{adTicket(
            ticket:{type:"${ticketType}",
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