//Connecting to database and executing queries.
//TODO: rename some functions to make them less confusing.(similair names for some.)
//TODO: refactor code.

module.exports = {connect, exec, query, insert, insertIntoPaymentsDB, insertIntoDeliverectDB, payTicket};

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


function query(qry){
	return new Promise((resolve, reject) => {
		let connection = new Connection(config);
		connection.on('connect', err => {
			if(err)	reject(err);
			else{
				writeToLog('Connected To DB.');
				Rqst = new Request(qry,(err,rowCount,rows) => {
					if(err){
						connection.close();
						reject(err);
					} else {
						writeToLog(`Result: ${res}`);
						connection.close();
						resolve(res);
					}
				}).on('row', col =>{
					let row = {};
					for(let i in col){
						row[col[i].metadata.colName] = col[i].value;
					}
					res.push(row);
				});
				connection.execSql(Rqst);
			}
		});
		connection.connect();
	});
}

function exec(qry){
	console.log(qry);
	return new Promise((resolve, reject) => {
		let connection = new Connection(config);
		connection.on('connect', err => {
			if(err)	{console.log(err); reject(err);}
			else{
				writeToLog('Connected To DB.');
				Rqst = new Request(qry,(err,rowCount,rows) => {
					if(err){
						console.log(err);
						connection.close();
						reject(err);
					} else {
						writeToLog(`Updated ${rowCount} rows.`);
						connection.close();
						resolve(true);
					}
				});
				connection.execSql(Rqst);
			}
		});
		connection.connect();
	});
}

//TODO: create insert function
function insert(qry){

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
	`DROP FUNCTION IF EXISTS dbo.getPickupInterval
	GO

	CREATE FUNCTION dbo.getPickupInterval ( @input varchar(10) )
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

	WITH CTE as (
		SELECT SUM(TotalAmount) as TotalAmount, pickupTime, ROW_NUMBER() OVER( ORDER BY pickupTime) as rn
		FROM (SELECT TotalAmount, dbo.getPickupInterval(val) as pickupTime
			FROM Tickets
			CROSS APPLY OPENJSON(TicketTags) WITH (tagName varchar(30) '$.TN', val varchar(30) '$.TV') as pickupTime
			WHERE CAST(Date as date) = CAST(GETDATE() - 3 as date)
			AND tagName = 'Pickup Time'
			UNION
			SELECT TotalAmount, pickupTime
			FROM (Values
				(0,'16:30'), 
				(0,'16:45'), 
				(0,'17:00'), 
				(0,'17:15'), 
				(0,'17:30'), 
				(0,'17:45'), 
				(0,'18:00'), 
				(0,'18:15'), 
				(0,'18:30'), 
				(0,'19:00'), 
				(0,'19:15'), 
				(0,'19:30'), 
				(0,'19:45'), 
				(0,'20:00'), 
				(0,'20:15'), 
				(0,'20:30')
			) AS emptyTimeTable(TotalAmount, pickupTime)
		)a
		GROUP BY pickupTime
	)


	SELECT TotalAmount, pickupTime
	FROM CTE
	WHERE rn >= (SELECT rn FROM CTE WHERE pickupTime = '16:30')`
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


//Pay ticket via SQL
function payTicket(ticketId, amount, paymentType){
	let qry = `
	DECLARE @PAID_AMOUNT decimal(16, 2) = ${amount};
DECLARE @TICKET_ID int = ${ticketId};
DECLARE @PAYMENT_TYPE varchar(30) = '${paymentType}';

DECLARE @TICKET_NUMBER int;
DECLARE @REMAINING_AMOUNT decimal(16,2);
DECLARE @TICKET_TAX_AMOUNT decimal(16,2);
DECLARE @TICKET_DEPARTMENT_ID int;
DECLARE @IS_FULLY_PAID bit;
DECLARE @AMOUNT_BEFORE_TAX decimal(16,2);

DECLARE @PAYMENT_TYPE_ID int;
DECLARE @DOCUMENT_ID int;
DECLARE @TRANSACTION_ID int;
DECLARE @TRANSACTION_TYPE varchar(20);
DECLARE @TRANSACTION_NAME varchar(50);


SELECT @TICKET_NUMBER = TicketNumber, 
    @REMAINING_AMOUNT = (RemainingAmount - @PAID_AMOUNT),
    @IS_FULLY_PAID = CASE 
        WHEN RemainingAmount - @PAID_AMOUNT = 0 THEN 1 
        ELSE 0
        END,
    @TICKET_DEPARTMENT_ID = DepartmentId,
    @TICKET_TAX_AMOUNT = CASE
        WHEN TotalAmountPreTax = TotalAmount THEN 0
        ELSE TotalAmount - TotalAmountPreTax
        END,
    @AMOUNT_BEFORE_TAX = TotalAmountPreTax
FROM [SambaPOS5].[dbo].[Tickets]
WHERE Id = @TICKET_ID;

SELECT @PAYMENT_TYPE_ID = Id
FROM [SambaPOS5].[dbo].[PaymentTypes]
WHERE Name = @PAYMENT_TYPE;


UPDATE [dbo].[Tickets]  SET 
	  [LastUpdateTime] = CURRENT_TIMESTAMP
	, [TicketVersion] = CURRENT_TIMESTAMP
	, [LastPaymentDate] = CURRENT_TIMESTAMP
	, [IsClosed] = @IS_FULLY_PAID
	, [RemainingAmount] = @REMAINING_AMOUNT
	, [TicketStates] = CASE
        WHEN @IS_FULLY_PAID = 0  THEN [TicketStates]
        ELSE REPLACE([TicketStates], '"Unpaid"', '"Paid"')
        END
WHERE Id = @TICKET_ID;

INSERT INTO [SambaPOS5].[dbo].[AccountTransactionDocuments]
(Date, DocumentTypeId, Name, UserId, UserName)
Values(
    CURRENT_TIMESTAMP,
    (SELECT Id FROM [SambaPOS5].[dbo].[AccountTransactionDocumentTypes] WHERE DescriptionTemplate like CONCAT(@PAYMENT_TYPE, '%')),
    CONCAT('Ticket Transaction [#',CAST(@TICKET_NUMBER as varchar), ']'),
    0,
    '*'
);
SELECT @DOCUMENT_ID = SCOPE_IDENTITY();

DECLARE @PAYMENT_BEFORE_TAX decimal(16, 2) = CASE
    WHEN @IS_FULLY_PAID = 1 THEN @AMOUNT_BEFORE_TAX
    ELSE @PAID_AMOUNT / 1.05
	END;
INSERT INTO [SambaPOS5].[dbo].[AccountTransactions]
(AccountTransactionDocumentId, Amount, ExchangeRate, AccountTransactionTypeId, SourceAccountTypeId, TargetAccountTypeId, IsReversed, Reversable, Name)
Values
(
    @DOCUMENT_ID,
    @PAYMENT_BEFORE_TAX,
    1.0000000000, 
    (SELECT Id FROM [SambaPOS5].[dbo].[AccountTransactionTypes] WHERE Name = 'Sale Transaction'),
    (SELECT SourceAccountTypeId FROM [SambaPOS5].[dbo].[AccountTransactionTypes] WHERE Name = 'Sale Transaction'),
    (SELECT TargetAccountTypeId FROM [SambaPOS5].[dbo].[AccountTransactionTypes] WHERE Name = 'Sale Transaction'),
    0,
    1,
    CONCAT('Sale Transaction [#', @TICKET_NUMBER, ']')
);
SELECT @TRANSACTION_ID = Id, @TRANSACTION_TYPE = AccountTransactionTypeId, @TRANSACTION_NAME = Name FROM [SambaPOS5].[dbo].[AccountTransactions] WHERE Id = SCOPE_IDENTITY();

INSERT INTO [SambaPOS5].[dbo].[AccountTransactionValues](
      [AccountTransactionId]
	, [AccountTransactionDocumentId]
	, [DepartmentId]
	, [AccountTypeId]
	, [AccountId]
	, [Date]
	, [Debit]
	, [Credit]
	, [Exchange]
	, [AccountTransactionTypeId]
	, [Name])
Values(
     @TRANSACTION_ID
    ,@DOCUMENT_ID
    ,@TICKET_DEPARTMENT_ID
    ,2
    ,1
    ,CURRENT_TIMESTAMP
    ,0
    ,@PAYMENT_BEFORE_TAX
    ,-@PAYMENT_BEFORE_TAX
    ,@TRANSACTION_TYPE
    ,@TRANSACTION_NAME
),
(
     @TRANSACTION_ID
    ,@DOCUMENT_ID
    ,@TICKET_DEPARTMENT_ID
    ,1
    ,2
    ,CURRENT_TIMESTAMP
    ,@PAYMENT_BEFORE_TAX
    ,0
    ,@PAYMENT_BEFORE_TAX
    ,@TRANSACTION_TYPE
    ,@TRANSACTION_NAME
)

IF EXISTS(SELECT * FROM (SELECT @TICKET_TAX_AMOUNT as Amount)a WHERE Amount != 0)
    BEGIN
        DECLARE @TAX_AMOUNT decimal(16,2) = CASE
            WHEN @REMAINING_AMOUNT = 0 THEN  @TICKET_TAX_AMOUNT
            ELSE @PAID_AMOUNT - @PAYMENT_BEFORE_TAX
            END
        INSERT INTO [SambaPOS5].[dbo].[AccountTransactions]
        (AccountTransactionDocumentId, Amount, ExchangeRate, AccountTransactionTypeId, SourceAccountTypeId, TargetAccountTypeId, IsReversed, Reversable, Name)
        Values
        (
            @DOCUMENT_ID,
            @TAX_AMOUNT,
            1.0000000000, 
            (SELECT Id FROM [SambaPOS5].[dbo].[AccountTransactionTypes] WHERE Name = '5% GST Processes'),
            (SELECT SourceAccountTypeId FROM [SambaPOS5].[dbo].[AccountTransactionTypes] WHERE Name = '5% GST Processes'),
            (SELECT TargetAccountTypeId FROM [SambaPOS5].[dbo].[AccountTransactionTypes] WHERE Name = '5% GST Processes'),
            0,
            1,
            '5% GST Processes'
        );
        SELECT @TRANSACTION_ID = Id, @TRANSACTION_TYPE = AccountTransactionTypeId, @TRANSACTION_NAME = Name FROM [SambaPOS5].[dbo].[AccountTransactions] WHERE Id = SCOPE_IDENTITY();

        INSERT INTO [SambaPOS5].[dbo].[AccountTransactionValues](
            [AccountTransactionId]
            , [AccountTransactionDocumentId]
            , [DepartmentId]
            , [AccountTypeId]
            , [AccountId]
            , [Date]
            , [Debit]
            , [Credit]
            , [Exchange]
            , [AccountTransactionTypeId]
            , [Name])
        Values(
            @TRANSACTION_ID
            ,@DOCUMENT_ID
            ,@TICKET_DEPARTMENT_ID
            ,2
            ,8
            ,CURRENT_TIMESTAMP
            ,0
            ,@TAX_AMOUNT
            ,-@TAX_AMOUNT
            ,@TRANSACTION_TYPE
            ,@TRANSACTION_NAME
        ),
        (
            @TRANSACTION_ID
            ,@DOCUMENT_ID
            ,@TICKET_DEPARTMENT_ID
            ,1
            ,2
            ,CURRENT_TIMESTAMP
            ,@TAX_AMOUNT
            ,0
            ,@TAX_AMOUNT
            ,@TRANSACTION_TYPE
            ,@TRANSACTION_NAME
        )
    END

INSERT INTO [SambaPOS5].[dbo].[AccountTransactions]
(AccountTransactionDocumentId, Amount, ExchangeRate, AccountTransactionTypeId, SourceAccountTypeId, TargetAccountTypeId, IsReversed, Reversable, Name)
Values
(
    @DOCUMENT_ID,
    @PAID_AMOUNT,
    1.0000000000, 
    (SELECT Id FROM [SambaPOS5].[dbo].[AccountTransactionTypes] WHERE Name = 'Payment Transaction'),
    (SELECT SourceAccountTypeId FROM [SambaPOS5].[dbo].[AccountTransactionTypes] WHERE Name = 'Payment Transaction'),
    (SELECT TargetAccountTypeId FROM [SambaPOS5].[dbo].[AccountTransactionTypes] WHERE Name = 'Payment Transaction'),
    0,
    1,
    CONCAT('Payment Transaction [', @PAYMENT_TYPE, ']')
);
SELECT @TRANSACTION_ID = Id, @TRANSACTION_TYPE = AccountTransactionTypeId, @TRANSACTION_NAME = Name FROM [SambaPOS5].[dbo].[AccountTransactions] WHERE Id = SCOPE_IDENTITY();

INSERT INTO [SambaPOS5].[dbo].[AccountTransactionValues](
      [AccountTransactionId]
	, [AccountTransactionDocumentId]
	, [DepartmentId]
	, [AccountTypeId]
	, [AccountId]
	, [Date]
	, [Debit]
	, [Credit]
	, [Exchange]
	, [AccountTransactionTypeId]
	, [Name])
Values(
     @TRANSACTION_ID
    ,@DOCUMENT_ID
    ,@TICKET_DEPARTMENT_ID
    ,1
    ,2
    ,CURRENT_TIMESTAMP
    ,0
    ,@PAID_AMOUNT
    ,-@PAID_AMOUNT
    ,@TRANSACTION_TYPE
    ,@TRANSACTION_NAME
),
(
     @TRANSACTION_ID
    ,@DOCUMENT_ID
    ,@TICKET_DEPARTMENT_ID
    ,3
    ,6
    ,CURRENT_TIMESTAMP
    ,@PAID_AMOUNT
    ,0
    ,@PAID_AMOUNT
    ,@TRANSACTION_TYPE
    ,@TRANSACTION_NAME
)

--paymentTypeId: 2 for Credit Card, 7 for Online Payment
INSERT INTO [SambaPOS5].[dbo].[Payments](
	  [TicketId]
	, [PaymentTypeId]
	, [DepartmentId]
	, [Name]
	, [Date]
	, [AccountTransactionId]
	, [Amount]
	, [TenderedAmount]
	, [UserId]
	, [TerminalId]
	, [ExchangeRate]
	, [PaymentData]
	, [CanAdjustTip]
	, [AccountTransaction_Id]
	, [AccountTransaction_AccountTransactionDocumentId]
	) 
VALUES (
       @TICKET_ID
     , @PAYMENT_TYPE_ID
     , 1
     , @PAYMENT_TYPE
     , CURRENT_TIMESTAMP
     , @TRANSACTION_ID
     , @PAID_AMOUNT
     , @PAID_AMOUNT
     , 0
     , 0
     , 1.0000000000
     , ''
     , 0
     , @TRANSACTION_ID
     , @DOCUMENT_ID
)`;
	return exec(qry);
}