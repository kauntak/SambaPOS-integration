var config = module.exports = {write};
const fs = require('fs');
const configJSON = require('./config.json');

load();

function load(){
    for(let i in configJSON){
        config[i] = configJSON[i];
    }
}

function write(newConfigJSON){
    fs.writeFileSync('./config/config.json', JSON.stringify(newConfigJSON, undefined, 2));
}