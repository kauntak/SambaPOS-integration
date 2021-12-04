//Connecting to database and executing queries.
//TODO rename some functions to make them less confusing.(similair names for some.)

module.exports = {connect, insertIntoPaymentsDB, insertIntoDeliverectDB, getHoldOrdersTotal};

const Connection = require('tedious').Connection;
const Request = require('tedious').Request;
const TYPES = require('tedious').TYPES;
const log = require('./log');
const report = require('./report');
const dotenv = require('dotenv');
dotenv.config();

const server = process.env.SQL_SERVER;
const user = process.env.USER;
const pwd = process.env.PWD;
const dbase = process.env.DATABASE;
const Dport = process.env.DATABASE_PORT;


const config = {
    server: server,
    authentication: {
        type: 'default',
        options: {
            userName: user,
            password: pwd
        }
    },
    options: {
        port: parseInt(`${Dport?Dport:1433}`,10),
        database: dbase
    }
};
let connection;

//write to log for SQL Query and results
function writeToLog(content){
    log.write("SQL", content);
}

//write to log for SQL errors
function writeToErrorLog(content){
	log.write("SQL_Error", content);
}

//connecting to database.
function connect(type, data){
	return new Promise((resolve, reject)=>{
		connection = new Connection(config);
		connection.on('connect', err => {
			writeToLog("Start connection.");
			if (err) {
				reject(err);
			} else {
				writeToLog('Connected to DB.');
				switch(type){
					case "Clover":
						resolve(insertIntoPaymentsDB(data));
						break;
					case "getHoldReportData":
						resolve(getHoldOrdersTotal());
						break;
					case "getDisplayData":
						resolve(getDisplayData());
						break;
					case "getOrderTotals":
						resolve(getCurrentOrderTotals());
						break;
					case "getCurrentTotals":
						resolve(getCurrentTotals());
						break;
				}
			}
		});
		connection.connect();
	}).catch(err => {
		writeToErrorLog("Type:" + type + "\r\nData:" + JSON.stringify(data));
	});
}

//Inserting processed data received from Clover into CreditTerminalTransaction
function insertIntoPaymentsDB(paymentData){
	console.log("Inserting");
	let qry = `DECLARE @JSON NVARCHAR(MAX) = '${JSON.stringify(paymentData)}';
			
		CREATE TABLE #TEMP(
			[Payment_Date] [nvarchar](50) NOT NULL,
			[Payment_ID] [nvarchar](50) NOT NULL,
			[Amount] [float] NOT NULL,
			[Tip_Amount] [float] NULL,
			[Payment_Employee_ID] [nvarchar](50) NOT NULL,
			[Payment_Employee_Name] [nvarchar](50) NOT NULL,
			[Result] [nvarchar](50) NOT NULL
			)ON [PRIMARY];
		
		INSERT INTO #TEMP ([Payment_Date],[Payment_ID],[Amount],[Tip_Amount],[Payment_Employee_ID],[Payment_Employee_Name],[Result])
		SELECT Date,Id,Amount,TipAmount,EmployeeId,EmployeeName,Result
		FROM OPENJSON(@JSON)
		WITH (
			Date datetime '$.time',
			Id nvarchar(30) '$.id',
			Amount float '$.amount',
			TipAmount float '$.tipAmount',
			EmployeeId nvarchar(20) '$.employee.id',
			EmployeeName nvarchar(20) '$.employee.name',
			Result nvarchar(20) '$.result'
			)
		WHERE Result = 'SUCCESS';
		
		INSERT INTO CreditTerminalTransactions([Payment_Date],[Payment_ID],[Amount],[Tip_Amount],[Payment_Employee_ID],[Payment_Employee_Name],[Result])
		SELECT [Payment_Date],[Payment_ID],[Amount],[Tip_Amount],[Payment_Employee_ID],[Payment_Employee_Name],[Result] FROM #TEMP
		WHERE NOT EXISTS(SELECT CreditTerminalTransactions.Payment_ID FROM CreditTerminalTransactions WHERE CreditTerminalTransactions.Payment_ID = #TEMP.Payment_ID collate SQL_Latin1_General_CP1_CI_AS);
		
		DROP TABLE #TEMP;`
	return new Promise((resolve, reject)=>{
		Rqst = new Request(qry,(err,rowCount,rows) => {
			if(err){
				reject(err);
			} else {
				writeToLog(`${rowCount} row(s) insesrted into CreditTerminalTransactions`);
				resolve(true);
				connection.close();
			}});
		connection.execSql(Rqst);
	}).catch(err => {
		writeToErrorLog("QUERY:" + qry + "\r\nERROR:" + err);
	});
}

//inserting processed data received from Deliverect into DeliverectOrders
function insertIntoDeliverectDB(data){
	let qry = `DECLARE @JSON NVARCHAR(MAX) = '${JSON.stringify(data)}';
			
		CREATE TABLE #TEMP(
			[Deliverect_Id] [nvarchar](50) NOT NULL,
			[Channel_Id] [nvarchar](50) NOT NULL,
			[ChannelType] [int] (2) NOT NULL,
			[Entity_Name] [nvarchar](30) NOT NULL, 
			[Created_Date] [datetime] NOT NULL,
			[Amount] [float] NOT NULL,
			[Customer_Name] [nvarchar](50) NOT NULL,
			[Customer_Phone] [nvarchar](15) NULL,
			[Ticket_Id] [int](10) NOT NULL,
			)ON [PRIMARY];
		
		INSERT INTO #TEMP ([Deliverect_Id], [Channel_Id], [Entity_Name], [Created_Date], [ChannelType], [Customer_Name], [Customer_Phone], [Ticket_Id], [Amount])
		SELECT Deliverect_Id, Channel_Id, [Entity_Name], [Created_Date], [ChannelType], [Customer_Name], [Customer_Phone], [Ticket_Id], [Amount]
		FROM OPENJSON(@JSON)
		WITH (
			Deliverect_Id nvarchar(50) '$.id',
			Channel_Id nvarchar(50) '$.channelId',
			Channel_Type int(2) '$.company.entityType',
			Entity_Name nvarchar(30) '$.company.entityName',
			Created_Date datetime '$.createdDate',
			Amount float '$.amount',
			Customer_Name nvarchar(30) '$.name',
			Customer_Phone nvarchar(15) '$.phone'
			Ticket_Id int(10) '$.ticketId'
			)
		
		INSERT INTO DeliverectOrders([Deliverect_Id], [Channel_Id], [Entity_Name], [Created_Date], [ChannelType], [Customer_Name], [Customer_Phone], [Ticket_Id], [Amount])
		SELECT [Deliverect_Id], [Channel_Id], [Entity_Name], [Created_Date], [ChannelType], [Customer_Name], [Customer_Phone], [Ticket_Id], [Amount] FROM #TEMP
		WHERE NOT EXISTS(SELECT DeliverectOrders.Deliverect_Id FROM DeliverectOrders WHERE DeliverectOrders.Deliverect_Id = #TEMP.Deliverect_Id collate SQL_Latin1_General_CP1_CI_AS);
		
		DROP TABLE #TEMP;`
	return new Promise((resolve, reject)=>{
		Rqst = new Request(qry,(err,rowCount,rows) => {
			if(err){
				connection.close();
				reject(err);
			} else {
				writeToLog(`${rowCount} row(s) insesrted into DeliverectOrders`);
				connection.close();
				resolve(true);
			}});
		connection.execSql(Rqst);
	}).catch(err => {
		writeToErrorLog("QUERY:" + qry + "\r\nERROR:" + err);
	});
}

//Retrieve current hold orders from Database.
//TODO: Change how Ticket data will be retrieved.
//		Possibly accept a date variable?
function getHoldOrdersTotal(){
	let qry = `SELECT Name, Value
	FROM [SambaPOS5].[dbo].[ProgramSettingValues]		
	WHERE Name like 'pickup%'
	order By Name`;
	/*TODO: change qry to:
	`DROP FUNCTION dbo.getPickupInterval
	GO

	CREATE FUNCTION dbo.getPickupInterval
	(
	@input varchar(10)
	)
	RETURNS varchar(10)
	AS
	BEGIN
		declare @time table (value varchar(10), RN int)
		INSERT INTO @time SELECT *, ROW_NUMBER() OVER(ORDER BY (SELECT NULL)) as RN FROM STRING_SPLIT(@input, ':')

		declare @hour varchar(10) 
		SET @hour = (SELECT value FROM @time WHERE RN = 1)
		declare @min varchar(10)
		set @min = (SELECT CAST(value as int) from @time WHERE RN = 2)

		set @min = (CASE
				WHEN @min < 14 THEN '00'
				WHEN @min < 29 THEN '15'
				WHEN @min < 44 THEN '30'
				ELSE '45'
		END)

		RETURN CONCAT(@hour, ':', @min)
	END
	GO

	SELECT SUM(TotalAmount), pickupTime
	FROM (
		SELECT TotalAmount, dbo.getPickupInterval(val) as pickupTime
		FROM Tickets
		CROSS APPLY OPENJSON(TicketTags) WITH (tagName varchar(30) '$.TN', val varchar(30) '$.TV') as pikcupTime
		WHERE CAST(Date as date) = CAST(GETDATE() as date)
		AND tagName = 'Pickup Time'
	)a
	GROUP BY pickupTime
	ORDER BY pickupTime`
	*/
	return new Promise((resolve, reject) => {
		let res = [];
		Rqst = new Request(qry,(err,rowCount,rows) => {
		if(err){
			connection.close();
			reject(err);
		} else {
			writeToLog(`Result: ${res}`);
			connection.close();
			resolve(res);
		}}).on('row', col =>{
			res.push(report.processHoldOrderData(col[0].value, col[1].value));
		});
		connection.execSql(Rqst);
	}).catch(err => {
		writeToErrorLog(qry+ "\r\n" + err);
	});;
}
//Get current order totals that are displayed.
function getCurrentOrderTotals(){
	let qry = `SELECT Value
	FROM [SambaPOS5].[dbo].[ProgramSettingValues]		
	WHERE Name like 'ordersTotal'`;
	return new Promise((resolve, reject) => {
		let res;
		Rqst = new Request(qry,(err,rowCount,rows) => {
		if(err){
			connection.close();
			reject(err);
		} else {
			writeToLog(`Result: ${res}`);
			connection.close();
			resolve(res);
		}}).on('row', col =>{
			res = col[0].value;
		});
		connection.execSql(Rqst);
	}).catch(err => {
		writeToErrorLog("QUERY:" + qry + "\r\nERROR:" + err);
	});
}

//Get current displayed orders.
function getDisplayData(){
	let qry = `SELECT SUBSTRING(TaskTypes.Name,1,1), Content
		FROM [SambaPOS5].[dbo].[Tasks]
		JOIN TaskTypes ON TaskTypes.Id = TaskTypeId
		WHERE TaskTypeId IN (SELECT Id FROM TaskTypes WHERE SubOf IS NULL AND Name like '_DSTask')
		AND Completed = 0
		ORDER BY TaskTypeId,Tasks.EndDate`;
	return new Promise((resolve, reject) => {
		let res = {};
		Rqst = new Request(qry,(err,rowCount,rows) => {
		if(err){
			connection.close();
			reject(err);
		} else {
			writeToLog(`Result: ${res}`);
			connection.close();
			resolve(res);
		}}).on('row', col =>{
			if(!res[col[0].value])
				res[col[0].value] = [];
			res[col[0].value].push(report.changeTaskToHTML(col[1].value));
		});
		connection.execSql(Rqst);
	}).catch(err => {
		writeToErrorLog("QUERY:" + qry + "\r\nERROR:" + err);
	});
}
//Get current sales totals.
function getCurrentTotals(){
	let qry = `SELECT Name,SUM(Amount) as Total,COUNT(Amount) as Count
	FROM Payments
	WHERE CAST(Payments.Date as date) = CAST(GETDATE() as date)
	GROUP BY Name`;
	return new Promise((resolve, reject) => {
		let res = {};
		Rqst = new Request(qry,(err,rowCount,rows) => {
		if(err){
			connection.close();
			reject(err);
		} else {
			writeToLog(`Result: ${JSON.stringify(res, undefined, 2)}`);
			connection.close();
			resolve(res);
		}}).on('row', col =>{
			console.log(col);
			res[col[0].value] = {};
			res[col[0].value][col[1].metadata.colName] = col[1].value;
			res[col[0].value][col[2].metadata.colName] = col[2].value;
		});
		connection.execSql(Rqst);
	}).catch(err => {
		writeToErrorLog("QUERY:" + qry + "\r\nERROR:" + err);
	});
}