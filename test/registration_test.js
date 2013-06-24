var helper = require('./test_helper');
var assert = require('assert');
var http = require('http');
var express = require('express');
var app = express();
var feebs = require('../index');
var request = require('request')
var addon = {};
var EventEmitter = require("events").EventEmitter;

describe('Auto registration', function(){
  var server = {};

  before(function(done){
    app.set('env','development');
    app.use(express.bodyParser());

    // mock host
    app.get(/consumer/, function(req,res){
      res.contentType('xml');
      res.send("<consumer><key>Confluence:5413647675</key></consumer>");
    });
    app.post(/installer/, function(req,res){
      request({
        url: 'http://localhost:3001/installed',
        method: 'POST',
        json: {
          baseUrl: 'http://localhost:3001/confluence',
          publicKey: 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCqgmc8W+aK5kc30gl7fhrmT++GalK1T/CvCN9SqW8M7Zr8QnWx8+Ml5zIgExhc7nuFr9Jh15g1FlbQfU2cvhAVoSbNxyDiyEmA0hajJwp59D7+rjVree6B/0a1O91BAIWGgttRigGSuQFytHQ22Yd6lNaM1tw1Pu63cLyTkmDlvwIDAQAB',
          description: 'host.consumer.default.description',
          pluginsVersion: '0.6.1010',
          clientKey: 'Confluence:5413647675',
          serverVersion: '4307',
          key: 'webhook-inspector',
          productType: 'confluence'
        }
      });
      res.send(204);
    });
    app.delete(/uninstaller/, function(req, res){
      res.send(204);
    });

    addon = feebs(app, {
      config: {
        "development": {
          "hosts": [
            "http://admin:admin@localhost:3001/confluence"
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

  function testIfEventCalled(spy, done){
    return setTimeout(function () {
      assert(false, 'Event never fired');
      done();
    }, 1000);
  }

  function eventFired(timer, done, cb){
    clearTimeout(timer);
    assert(true, "Event fired");
    if (cb) cb(done);
    else done();
  }

  it('should happen if addon.register() is set', function(done){
    var timer = testIfEventCalled();
    addon.on('addon_registered', function(){ eventFired(timer, done); });
  });

  it('should store the host details after installation', function(done){
    addon.on('host_settings_saved', function(key, settings){
      addon.settings.get('clientInfo', key).then(function(d){
        assert.deepEqual(d.val, settings);
        done();
      });
    });
    request({
      url: 'http://localhost:3001/installed',
      method: 'POST',
      json: {
        baseUrl: 'http://localhost:3001/confluence',
        publicKey: 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCqgmc8W+aK5kc30gl7fhrmT++GalK1T/CvCN9SqW8M7Zr8QnWx8+Ml5zIgExhc7nuFr9Jh15g1FlbQfU2cvhAVoSbNxyDiyEmA0hajJwp59D7+rjVree6B/0a1O91BAIWGgttRigGSuQFytHQ22Yd6lNaM1tw1Pu63cLyTkmDlvwIDAQAB',
        description: 'host.consumer.default.description',
        pluginsVersion: '0.6.1010',
        clientKey: 'Confluence:5413647675',
        serverVersion: '4307',
        key: 'webhook-inspector',
        productType: 'confluence'
      }
    });
  });

  it('should have webhook listener for remote_plugin_installed', function(done){
    assert.equal(EventEmitter.listenerCount(addon, 'remote_plugin_installed'), 1);
    done();
  });

  it('should also deregister if a SIGINT is encountered', function(done){
    process.kill(process.pid, 'SIGINT');
    var timer = testIfEventCalled();
    addon.on('addon_deregistered', function(){
      eventFired(timer, done, function(done){  });
      addon.settings.get('Confluence:5413647675').then(
        function(settings){
          assert(!settings, "settings deleted");
          done();
        },
        function(err){
          assert.fail("settings not deleted " + err.toString());
          done();
        }
      );
    });
  });

});
