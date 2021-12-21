const samba = require('./Samba');
const log = require('./app');

//minutes x 60000 milliseconds(1minute)
const timeout =  5 * 60000;
const closedTimeout =  30 * 60000;

const isTest = false;


//Log for all SambaRequests
function writeToLog(content){
    log.write("Hold",content);
}

//write to log for Samba errors
function writeToErrorLog(content){
	log.write("Hold_Error", content);
}

start();

//Main function for Samba tasks. will have an inifinte loop that runs loopSamba() function if store is open.
async function start(){
    if(testing)
        isTest = true;
	writeToLog("Hold Started.\r\n\r\n\r\n");
    while(true){
        if(samba.isOpen()){
            try{await loopHold();}
            catch(err){if(err) writeToErrorLog(err)}
            await new Promise(r => setTimeout(r, timeout));
            if(isTest) break;
        }
        else
            await new Promise(r => setTimeout(r, closedTimeout));
    }
}
//TODO: check for hold orders.
async function loopHold(){
    await samba.getCheckHoldOrders();
}
