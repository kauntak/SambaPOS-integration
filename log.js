module.exports = {write}

const fs = require('fs');

function write(source, content){
	var date = new Date();
	date = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 19).replace('T', ', ') + ":" + date.getMilliseconds();
	if(typeof content == "Object")
	 	content = JSON.stringify(content);
    //console.log(content);
	fs.appendFile(`log/log_${source}.txt`, `${date}: ${content}\r\n`,(err) => {
        if(err) console.log(err);
        }
    );
}