//Building html for reports.
//TODO: Change to Angular?

module.exports = {generateReport, processHoldOrderData, changeTaskToHTML};
const sql = require('./sql');
const samba = require('./Samba');
const log = require('./log');

const font = 'font-family: Arial, Helvetica, sans-serif;';

const style = `
        <style>
            /*Mobile*/
            @media only screen and (max-width:480px){
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

//compiles all reports into a single report, as a title and content pair
async function getReports(){
    let reports = await getDisplayReports();
    reports["hold"] = await getHoldReportTable();
    reports["total"] = await getTotalReportTable();
    return reports;
}

//will create sections that are collapsable(accordion) for each report
function getCollapsableSections(data){
    let returnHtml = "";
    let count = 1;
    let list = ["total", "hold", "S", "K", "D"];
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

//get current orders displayed on Kitchen Displays.
//If the screen is the SDS(Sushi Display Screen) it will add the current order totals.
async function getDisplayReports(){
    let data = await sql.connect("getDisplayData");
    let ordersTotal = await getOrderTotals();
    let returnData = {};
    for(let i in data){
        returnData[i] = {content:processDisplayData(data[i]), title:`${i}DS${i=="S" ? " - $" + ordersTotal : ''}`};
    }
    return returnData;
}

//places html table for display data into a div section that makes it scrollable.
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
//SQL Query to get orders on hold.
function getHoldReportData(){
    return sql.connect("getHoldReportData");
}
//Build html table for hold orders.
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


//SQL Query to get the current displayed order totals.
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

//Build table for current sales, split into Payment Options, and Grand Total.
//Will return a Total $0.00 if no sales so far.
function buildCurrentTotalTable(data){
    let isEmpty = true;
    for(let i in data){
        isEmpty = false;
        break;
    }
    if(isEmpty) return `<p style="padding-left:15px;">Total  $0.00</p>`;
    
    let options = {th: `colspan="2"`};
    let nameOptions = {td:`class="totalNameTd"`};
    let valueOptions = {td:`class="totalValueTd"`};
    let table = [];
    let grandTotalAmount = 0;
    let grandTotalCount = 0;
    for(let i in data){
        let headers = [i];
        let nameCol = [["Subtotal"]];
        let valCol = [0];
        for(let j in data[i]){
            nameCol.push([j]);
            if(j == "Total"){
                grandTotalAmount += parseFloat(data[i][j]);
                valCol[0] = parseFloat(data[i][j]);
                data[i][j] = "$"+data[i][j];
            } 
            else grandTotalCount += parseInt(data[i][j]);
            valCol.push([data[i][j]]);
        }
        valCol[0] = ["$" + round(valCol[0]/1.05, 2)];
        nameCol = buildTable(6,undefined,nameCol,nameOptions);
        valCol = buildTable(6,undefined,valCol,valueOptions);
        let subTable = buildTable(5,headers,[[nameCol,valCol]], options);
        table.push(subTable);
    }
    let headers = ["Grand Total"];
    let nameCol = [buildTable(6, undefined, [["SubTotal"],["Total"], ["Count"]], nameOptions)];
    let valCol = [buildTable(6, undefined, [["$" + round(grandTotalAmount/1.05, 2)]["$" + round(grandTotalAmount, 2)], [grandTotalCount]], valueOptions)];
    let subTable = buildTable(5, headers, [[nameCol, valCol]], options);
    table.unshift(subTable);
    return buildTable(4, undefined, [table], undefined);
}

//Runs sql query to get current sales total for the day.
function getCurrentTotals(){
    return sql.connect("getCurrentTotals");
}

//Build html table from data, and add appropriate html attributes.
//TODO: Angular? React? below code is...inefficient/hard to read/understand.
function buildTable(tabs,header, data, options){
    if(!options) options = {};
    let i = 0;
    let tabCh = "\t";
    let tab = "";
    let newLine = "\n";
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
    let returnTable = `${newLine}${tab}${table}`;
    if(header){
        returnTable += `
${tab}${tabCh}${trh}`;
        for(let i in header){
            returnTable += newLine + 
            `${tab}${tabCh}${tabCh}${th}` +
            `${tab}${tabCh}${tabCh}${tabCh}${header[i]}` +
            `${tab}${tabCh}${tabCh}${thEnd}`;
        }
        returnTable += `${newLine}${tab}${tabCh}${trhEnd}`;
    }
    for(let i in data){
        returnTable += newLine + 
            `${tab}${tabCh}${tr}`;
        for(let j in data[i]){
            returnTable += newLine + 
            `${tab}${tabCh}${tabCh}${td}` + newLine + 
            `${tab}${tabCh}${tabCh}${tabCh}${data[i][j]}` + newLine +
            `${tab}${tabCh}${tabCh}${tdEnd}`;
        }
        returnTable += `${newLine}${tab}${tabCh}${trEnd}`;
    }
    returnTable += `${newLine}${tab}${tableEnd}`;
    return returnTable;
}

//Will process Total Hold Order data retrieved from database into Time, and Amount pairs.
function processHoldOrderData(time, amount){
	var t = time.substr(6).split(".");
	t[1] = addTrailingZeroes(parseFloat(("0." + (t[1]?t[1]:"0"))) * 60);
	amount = (amount + "").split(".");
    amount = `${amount[0]}.${addTrailingZeroes(amount[1])}`;
    amount = getColoredHoldPrice(amount);
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
//Will return the color depending on the input amount
function getColoredHoldPrice(input){
    let amount = parseFloat(input);
    if(amount == 0) var color = "gray";
    else if(amount <= 250) color = "white";
    else if(amount <= 500) color = "yellow";
    else if(amount <= 750) color = "orange";
    else if(amount <= 1000) color = "tomato";
    else if(amount > 1000) color = "firebrick";
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

//round any values to specified precision.(For floating point calculations.)
function round(value, precision){
	let multiplier = Math.pow(10, precision || 0);
	return Math.round(value * multiplier) / multiplier;
}