var helper = require('./test_helper');
var assert = require('assert');
var http = require('http');
var express = require('express');
var app = express();
var ac = require('../index');
var request = require('request')
var logger = require('./logger');
var spy = require("sinon").spy;
var EventEmitter = require("events").EventEmitter;
var addon = {};

describe('Auto registration', function(){
  var server = {};
  var regPromise;

  before(function(done){
    app.set('env','development');
    app.use(express.bodyParser());

    // mock host
    app.get(/consumer/, function(req, res){
      res.contentType('xml');
      res.send("<consumer><key>Confluence:5413647675</key></consumer>");
    });
    app.post(/installer/, function(req,res){
      request({
        url: 'http://localhost:3001/enabled',
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
      res.send(200);
    });
    app.delete(/uninstaller/, function(req, res){
      res.send(204);
    });

    addon = ac(app, {
      config: {
        "development": {
          "hosts": [
            "http://admin:admin@localhost:3001/confluence"
          ]
        }
      }
    }, logger);
    server = http.createServer(app).listen(3001, function(){
      regPromise = addon.register().then(done);
      spy(regPromise, "resolve");
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

  it('should happen if addon.register() is called', function(done){
    var timer = testIfEventCalled();
    regPromise.then(function () { eventFired(timer, done); });
  });

  it('should store the host details after installation', function(done){
    addon.on('host_settings_saved', function(key, settings){
      addon.settings.get('clientInfo', key).then(function(d){
        assert.deepEqual(d.val, settings);
        done();
      });
    });
    request({
      url: 'http://localhost:3001/enabled',
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

  it('should have webhook listener for remote_plugin_enabled', function(done){
    assert.equal(EventEmitter.listenerCount(addon, 'remote_plugin_enabled'), 1);
    done();
  });

  it('should also deregister if a SIGINT is encountered', function(done){
    // first sigint will be us testing deregistration
    function trap() {
      // second sigint will be deregistration sending another to kill the process after
      // it completes it's work; we don't want the tests to exit, so we'll no-op that
      process.once('SIGINT', function () {
        // a third sigint can occur on test failures (why?), so this ensures that we see
        // the full error emitted before the tests terminate
        process.once('SIGINT', function () {});
      });
    }
    process.once('SIGINT', trap);
    process.kill(process.pid, 'SIGINT');
    var timer = testIfEventCalled();
    addon.on('addon_deregistered', function(){
      eventFired(timer, done, function () {});
      addon.settings.get('Confluence:5413647675').then(
        function(settings){
          assert(!settings, "settings not deleted");
          done();
        }
      );
    });
  });

});
