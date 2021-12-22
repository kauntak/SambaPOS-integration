// const fs = require('fs');
//const fork = require('child_process').fork;

document.getElementById("addRowButton").addEventListener("click", addRow);
document.getElementById("startButton").addEventListener("click", toggleStart);
window.Server.start();
window.Server.stop();

let saveButtons = document.getElementsByClassName("saveButton");
for(let i in saveButtons){
    saveButtons[i].addEventListener("click", saveData);
}

let tabButtons = document.getElementsByClassName("tablinks");
for(let i in tabButtons){
    tabButtons[i].addEventListener("click", openSetting);
}

let openCheckBoxes = document.getElementsByClassName("openCheckBox");
for(let i in openCheckBoxes){
    openCheckBoxes[i].addEventListener("onchange", toggleCheckBox);
}

function openSetting(event, elementId) {
    // Get all elements with class="tabcontent" and hide them
    let tabcontent = document.getElementsByClassName("tabcontent");
    for (let i = 0; i < tabcontent.length; i++) {
        if(!tabcontent[i]) continue;
        tabcontent[i].style.display = "none";
    }

    // Get all elements with class="tablinks" and remove the class "active"
    let tablinks = document.getElementsByClassName("tablinks");
    for (i = 0; i < tablinks.length; i++) {
        if(!tablinks[i]) continue;
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }

    // Show the current tab, and add an "active" class to the button that opened the tab
    document.getElementById(elementId).style.display = "block";
    event.currentTarget.className += " active";
} 

function load(){
    const changeCamelCaseToSentence = (input) => {
        let result = input.replace(/([A-Z])/g, ' $1');
        return result.charAt(0).toUpperCase() + result.slice(1);
    };
    const createDivButtons = (config) =>{
        let buttons = `<div class="tab">
                        <button class="tablinks" onclick="openSetting(event, 'home')">Home</button>`;
        for(let i in config){
            buttons += `<button class="tablinks" onclick="openSetting(event, '${i}')">${changeCamelCaseToSentence(i)}</button>`;
        }
        buttons += `</div>`;
        return buttons;
    };
    const createDiv = (config) => {
        let html = `
            <div class="tabcontent" id="home" stlye="display:block">
                <button type="button" id="startButton" onclick="toggleStart()" class="startButton">Start</button>
                <div class="logcontainer">
                    <div id="log"></div><br/>
                    <div id="errorlog"></div>
                </div>
            </div>`;
        for(let i in config){
            html += `
            <div class="tabcontent" id="${i}">
                <form action="submit" class="settingsForm">
                    <table class="formTable">`;
            if(i != 'openTime'){
                for(let j in config[i]){
                    html += `<tr>`;
                    html += `<td> <label for="${i}-${j}">${changeCamelCaseToSentence(j)}:</label></td>`
                    if(typeof config[i][j] == "object"){
                        let k = 0;
                        html += `<td><table id="${i}-${j}ArrayTable">`;
                        for(; k < config[i][j].length;k++){
                            html += `<tr><td><input type="text" class="dataToSave" name="${i}-${j}-${k}" id="${i}-${j}-${k}" value="${config[i][j][k]}" pattern="^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$" placeholder="IP Address.(0.0.0.0)"></td></tr>`;
                        }
                        html += `<tr><td><input type="text" class="dataToSave" name="${i}-${j}-${k}" id="${i}-${j}-${k}"  pattern="^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$" placeholder="IP Address.(0.0.0.0)"></td></tr>
                        <tr id="${i}-${j}ArrayButtonRow">
                            <td>
                            <button type="button" onclick="addRow('${i}','${j}','${k}')" id="addRowButton">Add</button>
                            </td>
                        </tr></table></td>`;
                    }
                    else
                        html += `<td><input type="text" class="dataToSave" name="${i}-${j}" id="${i}-${j}" value="${config[i][j]}"></td></tr>`;
                }
                    
            } else{
                let weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
                for(let j in config[i]){
                    html += `<tr><td>${weekday[j]}</td>
                                <td><table>`;
                    for(let k in config[i][j]){
                        let checkOption = "";
                        let timeOption = "";
                        if(config[i][j].isOpen){
                            checkOption += "checked";
                            if(k != 'isOpen')
                                timeOption += ` value="${config[i][j][k]}" `;
                        }else
                            timeOption += "readonly";
                        html += `
                                <tr>
                                    <td><label for="${i}-${j}-${k}">${changeCamelCaseToSentence(k)}:</label></td>
                                    <td${k=='isOpen'? ` style="position: relative; display: inline-block;"` :''}><input name="${i}-${j}-${k}" id="${i}-${j}-${k}" ${k == 'isOpen' ? 'type="checkbox" class="openCheckBox dataToSave" onchange="toggleCheckBox(event)" ' + checkOption : 'type="time" class="timeInput dataToSave" step="300" ' + timeOption}>${k == 'isOpen' ? `<label for="${i}-${j}-${k}" class="openCheckBox-label">Switch</label>`:''}</td>
                                    
                                </tr>`;
                    }
                    html += `</table></td></tr>`;
                }
            }
            html += `</table><button type="button" class="saveButton" onclick="saveData()">Save</button></form></div>`;
        }
        return html;
    };
    fetch('../config/config.json')
    .then(res => {
        if(!res.ok){
            throw new Error("HTTP Error: " + res.status);
        }
        return res.json();
    })
    .then(config => {
        document.getElementById("main").innerHTML += `
            ${createDivButtons(config)}
            ${createDiv(config)}`;
        
        return;
    })
    .catch(err => alert(err));
}

function addRow(i, j, k){
    k = parseInt(k);
    let element;
    let canContinue = true;
    let list = [];
    for(let l = 0; l <= k; l++){
        element = document.getElementById(`${i}-${j}-${l}`);
        list.push(element.value);
        let isValid = !element.validity.patternMismatch && list[l] != null && list[l] != '';
        if(!isValid){
            canContinue = false;
            break;
        }
    }
    //alert(canContinue);
    if(canContinue){
        element = document.getElementById(`${i}-${j}ArrayButtonRow`);
        element.parentNode.removeChild(element);
        element = document.getElementById(`${i}-${j}ArrayTable`);
        element.innerHTML +=  `
                 <tr><td><input type="text" class="dataToSave" name="${i}-${j}-${k+1}" id="${i}-${j}-${k+1}"  pattern="^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$" placeholder="IP Address.(0.0.0.0)"></td></tr>
                <tr id="${i}-${j}ArrayButtonRow">
                    <td>
                    <button onclick="addRow('${i}','${j}', '${k+1}')">Add</button>
                    </td>
                </tr>`;
        for(let l in list)
            document.getElementById(`${i}-${j}-${l}`).value = list[l];
    }
    else{
        alert("Invalid or blank fields.");
    }
    
}



function toggleCheckBox(event){
    let baseId = event.currentTarget.id.split("-");
    baseId = `${baseId[0]}-${baseId[1]}-`;
    let fromElement = document.getElementById(baseId + "from");
    let toElement = document.getElementById(baseId + "to");
    if(event.currentTarget.checked == true){
        fromElement.readOnly = false;
        fromElement.value = '00:00';
        toElement.readOnly = false;
        toElement.value = '12:00';
    }
    else{
        fromElement.readOnly = true;
        fromElement.value = '';
        toElement.readOnly = true;
        toElement.value = '';
    }
}


function toggleStart(){
    let startButton = document.getElementById("startButton");
    if(startButton.innerHTML == "Start"){
        window.api.send("startApp");
        startButton.innerHTML = "Stop";
        startButton.style["background-image"] = "linear-gradient(#884949, #371d1d)";
        startButton.style.color="#cbb1a4";
    } else{
        window.api.send("stopApp");
        startButton.innerHTML = "Start";
        startButton.style["background-image"] = "linear-gradient(#3b6738, #1d3528)";
        startButton.style.color = "#a4cba8";
    }
    
}



function saveData(){
    let elements = document.getElementsByClassName("dataToSave");
    let config = {};
    for(let index in elements){
        if(!elements[index] || !elements[index].id) continue;
        let [i,j,k] = elements[index].id.split("-");
        if(!config[i]) 
            config[i] = {};
        if(!k){
            config[i][j] = elements[index].value || "";
        } else {
            if(!config[i][j])
            config[i][j] = {};
            if(i == "openTime"){
                config[i][j][k] = elements[index].value;
            } else{
                if(elements[index].value)
                    config[i][j][k] = elements[index].value;
            }
        }
        
    }
    console.log(config);
}