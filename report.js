module.exports = {generateReport, processHoldOrderData, changeTaskToHTML};
const sql = require('./sql');
const samba = require('./Samba');
const log = require('./log');

const font = 'font-family: Arial, Helvetica, sans-serif;';

const style = `
        <style>
            /*Mobile*/
            @medio only screen and (max-width:480px){
                width:480px;
            }
            td.display {
                padding: 5px;
                margin: 5px; 
                text-align:left; 
                vertical-align:text-top; 
                background-color:rgb(46, 46, 46);
            }
            tr.holdTr{
                padding: 10px;
                margin: 10px;
                text-align: center;
            }
            tr.holdTr:hover{
                background-color:rgb(60,60,60);
            }
            table.holdTable{
                border-collapse: collapse;
                margin-left: 20px;
                width:250px;
            }
            td.totalNameTd{
                padding: 10px;
                padding-bottom: 0px;
                font-weight:bold;
                text-align:left;
                font-size:0.9em;
            }
            td.totalValueTd{
                padding: 10px;
                padding-bottom: 0px;
                text-align:right;
                font-size:0.9em;
            }
            div.column{
                float: left;
                width: 255px;
                padding: 5px;
                padding-top: 0px;
            }
            div.split:after{
                content:"";
                clear: both;
                display:table;
            }
            div.scroll{
                background-color:rgb(85,85,85);
                color:whitesmoke;
                margin: 5px, 5px;
                padding: 5px;
                width: auto;
                height: auto;
                max-height: 400px;
                overflow-x:auto;
                overflow-y:auto;
            }
            .collapsable > input[name="collapse"] {
                display: none;
            }

            .collapsable label,
            .collapsable .content{
                max-width: 620px;
                margin: 0 auto;
            }


            .collapsable .content {
                background: #fff;
                ${font}
                overflow: hidden;
                height: 0;
                transition: 0.5s;
                box-shadow: 1px 2px 4px rgba(0, 0, 0, 0.3);
            }

            .collapsable > input[name="collapse"]:checked ~ .content {
                max-height: 400px;
                transition: height 0.5s;
            }

            .collapsable label {
                display: block;
            }

            
            .collapsable > input[name="collapse"]:checked ~ .content {
                height: auto;
            }

            .collapsable {
                margin-bottom: 1em;
            }

            .collapsable > input[name="collapse"]:checked ~ .content {
                border-top: 0;
                transition: 0.5s;
            }

            .collapsable .sectionHeading {
                margin: 0;
                font-size: 16px;
            }

            .collapsable label {
                color: rgb(245, 226, 226);
                cursor: pointer;
                ${font}
                font-weight: bold;
                padding: 10px;
                background: #022701;
                user-select: none;
            
            }

            .collapsable label:hover,
            .collapsable label:focus {
                background: #3c5047;
            }

            .collapsable .sectionHeading label:before {
                content: "▼";
                transform: rotate(-90deg);
                display: inline-block;
                margin-right: 10px;
                font-size: 1em;
                line-height: 1.5em;
                vertical-align: middle;
                transition: 0.5s;
            
            }

            .collapsable > input[name="collapse"]:checked ~ .sectionHeading label:before {
                transform: rotate(0deg);
                transform-origin: center;
                transition: 0.4s;
            }
        </style>
`;

function writeToLog(content){
    log.write("report", content);
}


function writeToErrorLog(content){
	log.write("Clover_Error", content);
}

async function generateReport(){
    let reports = await getReports();
    let report = `
<!DOCTYPE html>
<html>
    <head>
        ${style}
    </head>
    <body style="background-color:rgb(70,70,70);">
        <div>
            ${getCollapsableSections(reports)}
        </div>
    </body>
</html>`;
    writeToLog(report);
    return report;
}

async function getReports(){
    let reports = await getDisplayReports();
    reports["hold"] = await getHoldReportTable();
    reports["total"] = await getTotalReportTable();
    return reports;
}


function getCollapsableSections(data){
    let returnHtml = "";
    let count = 1;
    let list = ["total", "hold", "S", "K", "D"]
    console.log(data);
    for(let i in list){
        if(!(data[list[i]])) continue;
        returnHtml +=`
            <section class="collapsable">
                <input type="checkbox" name="collapse" id="collapseCheckBox${count}">
                <h2 class="sectionHeading">
                    <label for="collapseCheckBox${count}">
                        ${data[list[i]].title}
                    </label>
                </h2>
                <div class="content">
                    ${data[list[i]].content}
                </div>
            </section>`;
        count++;
        }
    return returnHtml;
}


async function getDisplayReports(){
    let data = await sql.connect("getDisplayData");
    let ordersTotal = await getOrderTotals();
    let returnData = {};
    for(let i in data){
        returnData[i] = {content:processDisplayData(data[i]), title:`${i}DS${i=="S" ? " - $" + ordersTotal : ''}`};
    }
    return returnData;
}


function processDisplayData(data){
    return `<div class="scroll">
                    ${buildTable(5, undefined, [data], {td:`class="display"`})}
                </div>`;
}

//get data from database for future pickup orders, grouped by 15minute increments
//[['4:45', '$10.00'], ['5:00', $12.00]]
function getHoldReportTable(){
    return getHoldReportData().then( data => {
        let header = ["Time", "Amount"];
        return {
            title:"Evening Hold Order Totals",
            content:`
        <div class="scroll">
            ${getHoldTables(header, data, {tr:`class="holdTr"`, table:`class="holdTable"`})}
        </div>`};
    });
}
//Will retrieve Hold order data from Database
function getHoldReportData(){
    return sql.connect("getHoldReportData");
}

function getHoldTables(header, data, options){
    let leftData = data.splice(0,8);
    let left = `<div class="column">
                    ${buildTable(5,header, leftData,options)}
                </div>`;
    let right = `<div class=column" style>
                    ${buildTable(5,header, data,options)}
                </div>`;
    return `<div class="split">
                ${left}
                ${right}
            </div>`;
}



function getOrderTotals(){
    return sql.connect("getOrderTotals");
}


//Will return today's sales total upto current time.
function getTotalReportTable(){
    return getCurrentTotals().then(data => {
        var content = buildCurrentTotalTable(data);
        return {
        title: "Current Sales",
        content:`<div class="scroll" id="currentSales">
                ${content}
            </div>`};
    });
}

function buildCurrentTotalTable(data){
    let isEmpty = true;
    for(let i in data){
        isEmpty = false;
        break;
    }
    if(isEmpty) return `<p>Total  $0.00</p>`;
    ;
    let options = {th: `colspan="2"`};
    let nameOptions = {td:`class="totalNameTd"`};
    let valueOptions = {td:`class="totalValueTd"`};
    let table = [];
    for(let i in data){
        let headers = [i];
        let nameCol = [];
        let valCol = [];
        for(let j in data[i]){
            nameCol.push([j]);
            if(j == "Total")
                data[i][j] = "$"+data[i][j];
            valCol.push([data[i][j]]);
        }
        nameCol = buildTable(6,undefined,nameCol,nameOptions);
        console.log(nameCol);
        valCol = buildTable(6,undefined,valCol,valueOptions);
        console.log(valCol);
        let t = buildTable(5,headers,[[nameCol,valCol]], options);
        console.log(t);
        table.push(t);
    }
    return buildTable(4, undefined, [table], undefined);
}

function getCurrentTotals(){
    return sql.connect("getCurrentTotals");
}

//Build html table from data, and add appropriate 
function buildTable(tabs,header, data, options){
    if(!options) options = {};
    let i = 0;
    let tabCh = "\t";
    let tab = "";
    while(i < tabs){
        tab += tabCh;
        i++;
    }
    let table = `<table ${options.table?options.table:''}>`;
    let tableEnd = "</table>";
    let trh = `<tr ${options.trh?options.trh:''}>`;
    let trhEnd = "</tr>"; 
    let tr = `<tr ${options.tr?options.tr:''}>`;
    let trEnd = "</tr>";
    let th = `<th ${options.th?options.th:''}>`;
    let thEnd = "</th>";
    let td = `<td ${options.td?options.td:''}>`;
    let tdEnd = "</td>";
    let returnTable = `
${tab}${table}`;
    if(header){
        returnTable += `
${tab}${tabCh}${trh}`;
        for(let i in header)
            returnTable += `
${tab}${tabCh}${tabCh}${th}
${tab}${tabCh}${tabCh}${tabCh}${header[i]}
${tab}${tabCh}${tabCh}${thEnd}`;
        returnTable += `
${tab}${tabCh}${trhEnd}`;
    }
    for(let i in data){
        returnTable += `
${tab}${tabCh}${tr}`;
        for(let j in data[i]){
            returnTable += `
${tab}${tabCh}${tabCh}${td}
${tab}${tabCh}${tabCh}${tabCh}${data[i][j]}
${tab}${tabCh}${tabCh}${tdEnd}`;
        }
        returnTable += `
${tab}${tabCh}${trEnd}`;
    }
    returnTable += `
${tab}${tableEnd}`;
    return returnTable;
}

//Will process Totla Hold Order data retrieved from database into Time, and Amount pairs.
function processHoldOrderData(time, amount){
	var t = time.substr(6).split(".");
	t[1] = addTrailingZeroes(parseFloat(("0." + (t[1]?t[1]:"0"))) * 60);
	amount = (amount + "").split(".");
    amount = `${amount[0]}.${addTrailingZeroes(amount[1])}`;
    amount = getColoredHoldPrice(amount);
        
	//console.log(t, amount);
	return [t.join(":"),amount];
}

//Will add extra zeroes up to 2 digits.
function addTrailingZeroes(number){
	if(!number)
		number = 0;
	number = number + "";
	while(number.length < 2)
		number += "0";
	return number;
}

function getColoredHoldPrice(input){
    let color = "gray";
    let amount = parseFloat(input);
    if(amount > 0 && amount <= 250) color = "white";
    else if(amount > 250 && amount <= 500) color = "yellow";
    else if(amount > 500 && amount <= 750) color = "orange";
    else if(amount > 750 && amount <= 1000) color = "red";
    else if(amount > 1000) color = "darkred";
    return `<code style="color:${color}; ${font}">$${input}</code>`;
}


//Will change SambaPOS task display formatting into html formatting.
function changeTaskToHTML(data){
    return `<p style=\"color:white; ${font}\">
                                            ${data.replace(/<size [#0-9]+>/g, "").replace(/<\/size>/g, "").replace(/(?<=<[A-Za-z]+) (?=[#A-Za-z0-9]+>)/g,":")
                                                .replace(/<(?=[A-Za-z]+:[#A-Za-z0-9]+>)/g, "<code style=\"")
                                                .replace(/(?<=<code style=\"[A-Za-z]+:[#A-Za-z0-9]+)>/g,"\">")
                                                .replace(/old>/g, ">").replace(/<\/[a-zA-Z]{2,}>/g, "</code>")
                                                .replace(/="size:/g, `="font-size:`)
                                                .replace(/(?<="font-size:[\d]+)"/g, `px"`)
                                                .replace(/\r\n/g, "</br>")
                                                .replace("__________________________________________", "__________________")}
                                        </p>`;
}