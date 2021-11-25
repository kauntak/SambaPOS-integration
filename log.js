module.exports = {write}

const fs = require('fs');

//will log for entire app, but will separate files depending on which module has called it.
function write(source, content){
	var date = new Date();
	date = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 19).replace('T', ', ') + ":" + date.getMilliseconds();
	if(typeof content == "Object")
	 	content = JSON.stringify(content);
    //console.log(content);
    if(!fs.existsSync('./log'))
		fs.mkdir('./log', err=> {if(err) console.log(err)});
	fs.appendFile(`log/log_${source}.txt`, `${date}: ${content}\r\n`,(err) => {
        if(err) console.log(err);
        }
    );
}