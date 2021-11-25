module.exports = {connect, insertIntoPaymentsDB, insertIntoDeliverectDB};

const Connection = require('tedious').Connection;
const Request = require('tedious').Request;
const TYPES = require('tedious').TYPES;
const log = require('./log');
const dotenv = require('dotenv');
dotenv.config();

const server = process.env.MESSAGE_SERVER;
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
  }
let connection;

//write to log for SQL
function writeToLog(content){
    log.write("SQL", content);
}

//connecting to database.
function connect(callback){
    connection = new Connection(config);
    connection.on('connect', err => {
		writeToLog("Start connection.");
	  if (err) {
		writeToLog("Error: " + err);
	  } else {
		writeToLog('Connected to DB.');
		if(callback)
			callback;
		}
	});
	connection.connect();
}

//Inserting processed data received from Clover into CreditTerminalTransaction
function insertIntoPaymentsDB(paymentData){
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
			WHERE NOT EXISTS(SELECT CreditTerminalTransactions.Payment_ID FROM CreditTerminalTransactions WHERE CreditTerminalTransactions.Payment_ID = #TEMP.Payment_ID);
			
			DROP TABLE #TEMP;`
	Rqst = new Request(qry,(err,rowCount,rows) => {
		if(err){
			writeToLog(qry+ "\r\n" + err);
		} else {
			writeToLog(`${rowCount} row(s) insesrted into CreditTerminalTransactions`);
			connection.close();
		}});
	connection.execSql(Rqst);
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
			WHERE NOT EXISTS(SELECT DeliverectOrders.Deliverect_Id FROM DeliverectOrders WHERE DeliverectOrders.Deliverect_Id = #TEMP.Deliverect_Id);
			
			DROP TABLE #TEMP;`
	Rqst = new Request(qry,(err,rowCount,rows) => {
		if(err){
			writeToLog(qry+ "\r\n" + err);
		} else {
			writeToLog(`${rowCount} row(s) insesrted into DeliverectOrders`);
			connection.close();
		}});
	connection.execSql(Rqst);
}