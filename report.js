module.exports = {getReport};
const sql = require('./sql');
const samba = require('./Samba');

async function getReport(){
    let report = "<!DOCTYPE html><html>";
    let holdData = await getHoldReportTable();
    let sdsData = await getSdsReport();
    //console.log(sdsData);
    report += sdsData;
    report += "</html>";
    return report;
}


//get data from database for future pickup orders, grouped by 15minute increments
//[['4:45', '$10.00'], ['5:00', $12.00]]
function getHoldReportTable(){
    return getHoldReportData().then( data => {
        data.unshift(["Time", "Amount"]);
        return buildTable(data);
    });
}

function getHoldReportData(){
    return sql.connect("getHoldReportData");
}

function buildTable(data){
    let table = "<table>";
    let element = data.shift();
    table += "<tr>";
    for(let i in element)
        table += `<th>${element[i]}</th>`;
    table += "</tr>";
    for(let i in data){
        table += "<tr>";
        for(let j in data[i]){
            table +=`<th>${data[i][j]}</th>`;
        }
        table += "</tr>";
    }
    table += "</table>";
    return table;
}

async function getSdsReport(){
    let data = await getSdsData();
    let returnData = "<div>";
    for(let i in data){
        returnData += "<div>" + data[i] + "</div>";
    }
    returnData += "</div>";
    return returnData;
}

function getSdsData(){
    return sql.connect("getSdsData");
}

//TO DO:
//-Get Data on current orders
//-Get current sales amount.