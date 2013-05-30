var helper = require('./test_helper');
var assert = require('assert');
var http = require('http');
var express = require('express');
var app = express();
var feebs = require('../index');
var request = require('request')
var addon = {};

describe('Auto registration request', function(){
  var server = {};

  before(function(done){
    app.set('env','development');
    app.get(/consumer/, function(req,res){
      res.contentType('xml');
      res.send("<consumer><key>jira:123456</key></consumer>");
    });
    app.post(/installer/, function(req, res){
      request.post('http://localhost:3001/installed');
      res.send(200);
    });
    app.delete(/uninstaller/, function(req, res){
      res.send(200);
    });
    addon = feebs(app, {
      config: {
        "development": {
          "hosts": [
            "http://admin:admin@localhost:3001/jira"
          ]
        }
      }
    });
    server = http.createServer(app).listen(3001, function(){
      addon.register();
      done();
    });
  });

  after(function(done){
    server.close();
    done();
  });

  it('should be sent if addon.register() is set', function(done){
    addon.on('addon_registered', function(){
      assert(true)
      done();
    });
  });

  it('should trigger the remote_plugin_installed and feebs should handle it', function(done){
    addon.on('remote_plugin_installed',function(){
      assert(true);
      done();
    })
  });

  it('should also deregister if a SIGINT is encountered', function(done){
    process.kill(process.pid, 'SIGINT');
    addon.on('addon_deregistered', function(){
      assert(true);
      done();
    });
  });

});