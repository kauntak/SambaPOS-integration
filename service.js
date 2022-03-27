var Service = require('node-windows').Service;

var svc = new Service({
    name:'SambaPOS Integrations',
    description:'SambaPOS Integration for Clover Payments auto-ticket settler service, Deliverect webhook service, Gloriafoods integration, and web report tool',
    script:require('path').join(__dirname,'app.js')
});

svc.on('install',function(){
  svc.start();
});

svc.on('uninstall',function(){
  console.log('Uninstall complete.');
  console.log('The service exists: ',svc.exists);
});


svc.install();
//svc.uninstall();