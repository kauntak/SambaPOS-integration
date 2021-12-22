var {ipcRenderer, contextBridge} = require('electron');


contextBridge.exposeInMainWorld(
    "api", {
        send: (channel, data) => {
            let validChannels = ["toMain", "startApp", "stopApp"];
            if(validChannels.includes(channel)){
                ipcRenderer.send(channel, data);
            }
        },
        receive: (channel, func) => {
            let validChannels = ["fromMain", "writeToLog", "writeToErrorLog"];
            if(validChannels.includes(channel)){
                ipcRenderer.on(channel, (event, data) => func(data));
            }
        }
    }
)



// ipc.addListener('log', (event, data)=>{
//     const logElement = document.getElementById("log");
// 	logElement.innerHTML += `<div><pre>${date}: ${content}</pre></div><br/>`;
// 	if(logElement.childNodes.length > 50){
// 		logElement.removeChild(logElement.firstChild);
// 	}
// });

