var express = require('express');
var feebs = require('../index');
var http = require('http');
var path = require('path');
var app = express();

app.set('env','development');
var addon = feebs(app, {
  config: {
    "development": {
      "store": {
        "type": "postgres",
        "connection": "postgres://localhost/postgres"
      },
      "hosts": [
        "http://admin:admin@localhost:2990/jira"
      ]
    }
  }
});
var port = addon.config.port();
app.set('port', 3000);

app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.cookieParser());
app.use(express.cookieSession({
  key: 'session',
  secret: "I'm a tester"
}));

app.use(addon.middleware());
app.use(app.router);
app.use(express.errorHandler());

http.createServer(app).listen(port, function(){
  addon.register();
});