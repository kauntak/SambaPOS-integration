var config = module.exports = {write};
const fs = require('fs');
load();

function load(){
    let configExists = fs.existsSync(__dirname + '/config.json');
    var configJSON;
    if(configExists)
        configJSON = require('./config.json');
    else
        configJSON = require('./config_base.json');
    for(let i in configJSON){
        config[i] = configJSON[i];
    }
}

function write(newConfigJSON){
    fs.writeFileSync('./config/config.json', JSON.stringify(newConfigJSON, undefined, 2));
}