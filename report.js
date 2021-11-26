module.exports = {generateReport, processHoldOrderData, changeTaskToHTML};
const sql = require('./sql');
const samba = require('./Samba');
const log = require('./log');

const style = `
    <style>
        td.display {
            border-top-width: 1px;
            border-top-style: solid;
            border-right-width: 1px;
            border-right-style: solid;
            border-bottom-width: 1px;
            border-bottom-style: solid;
            border-left-width: 1px;
            border-left-style: solid;
            padding-left: 5px;
            padding-top: 5px;
            padding-right: 5px;
            padding-bottom: 5px;
            margin-bottom: 5px;
            margin-left: 5px;
            margin-top: 5px;
            margin-right: 5px; 
            text-align:left; 
            vertical-align:text-top; 
            background-color:rgb(46, 46, 46);
        }
        div.scroll{
            margin: 5px, 5px;
            padding: 5px;
            width: 100vw;
            height: 400px;
            overflow-x:auto;
            overflow-y:auto;
        }
    </style>
`;



function writeToLog(content){
    log.write("report", content);
}


async function generateReport(){
    let report = `<!DOCTYPE html>
        <head>
            ${style}
        </head>
        <body>
            <div id="totalDiv">${'REPORT'}</div>
            <div id="holdDiv">${await getHoldReportTable()}</div>
            <div id="sdsDiv">${await getSdsReport()}</div>
        </body>
    </html>`;
    writeToLog(report);
    return report;
}


//get data from database for future pickup orders, grouped by 15minute increments
//[['4:45', '$10.00'], ['5:00', $12.00]]
function getHoldReportTable(){
    return getHoldReportData().then( data => {
        let header = ["Time", "Amount"];
        return buildTable(header, data);
    });
}
//Will retrieve Hold order data from Database
function getHoldReportData(){
    return sql.connect("getHoldReportData");
}

//Build html table from data
function buildTable(header, data, options){
    if(!options) options = {};
    let table = `<table ${options.table?options.table:''}>`;
    let tableEnd = "</table>";
    let tr = `<tr ${options.tr?options.tr:''}>`;
    let trEnd = "</tr>";
    let th = `<th ${options.th?options.th:''}>`;
    let thEnd = "</th>";
    let td = `<td ${options.td?options.td:''}>`;
    let tdEnd = "</td>";
    let returnTable = table + tr;
    if(header){
        for(let i in header)
            returnTable += th + header[i] + thEnd;
        returnTable += trEnd + tr;
    }
    for(let i in data){
        for(let j in data[i]){
            returnTable += td + data[i][j] + tdEnd;
        }
        returnTable += trEnd
    }
    returnTable += tableEnd;
    return returnTable;
}

async function getSdsReport(){
    let data = await getSdsData();
    return "<div class=\"scroll\">" + buildTable(undefined, [data], {td:`class="display"`}) + "</div>";
}

function getSdsData(){
    return sql.connect("getSdsData");
}

//TO DO:
//-Get Data on current orders
//-Get current sales amount.



function processHoldOrderData(time, amount){
	var t = time.substr(6).split(".");
	t[1] = addTrailingZeroes(parseFloat(("0." + (t[1]?t[1]:"0"))) * 60);
	amount = (amount + "").split(".");
	//console.log(t, amount);
	return [t.join(":"),`$${amount[0]}.${addTrailingZeroes(amount[1])}`];
}

function addTrailingZeroes(number){
	if(!number)
		number = 0;
	number = number + "";
	while(number.length < 2)
		number += "0";
	return number;
}


function changeTaskToHTML(data){
    return "<p style=\"color:white\">" + data.replace(/(?<=<[A-Za-z]+) (?=[#A-Za-z0-9]+>)/g,":")
        .replace(/<(?=[A-Za-z]+:[#A-Za-z0-9]+>)/g, "<code style=\"")
        .replace(/(?<=<code style=\"[A-Za-z]+:[#A-Za-z0-9]+)>/g,"\">")
        .replace(/old>/g, ">").replace(/<\/[a-zA-Z]{2,}>/g, "</code>")
        .replace(/="size:/g, `="font-size:`)
        .replace(/(?<="font-size:[\d]+)"/g, `px"`)
        .replace(/\r\n/g, "</br>")
        .replace("__________________________________________", "____________________") + "</p>";
    let regex = new RegExp("(<)(?:[A-Za-z]+)( )(?:[#A-Za-z0-9]+)(>)", "");
    let regex2 = new RegExp("(<)(?:[A-Za-z]+)( )(?:[#A-Za-z0-9]+)(>)", "g");
    let replaceStrings = ['',`<code style="`,`:`,`">`];
    while(true){
        let res = data.match(regex2);
        //console.log(res);
        if(res == null) break;
        for(let i in res){
            //console.log("res[i]:", res[i]);
            let resRegex = new RegExp(res[i], "g");
            let replace = res[i].match(regex);
            //console.log("replace", replace);
            let string = res[i];
            let j = 2;
            while(j <=4){
                if(j == 4)
                    j = 1;
                string = string.replace(replace[j], replaceStrings[j]);
                if(j == 1)
                    break
                j++;
            }
            data = data.replace(resRegex, string);
        }
    }
    return data.replace(/bold>/g, "b>").replace(/<\/[A-Za-z]{2,}>/g, "</code>").replace(/="size:/g, `="font-size:`);
}