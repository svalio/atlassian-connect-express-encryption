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
      res.send("<consumer><key>jira:123456</key></consumer>");
    });
    app.post(/installer/, function(req,res){
      request({
        url: 'http://localhost:3001/installed',
        method: 'POST',
        json: {
          clientKey: "jira:123456",
          publicKey: "BLAH"
        }
      });
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
    var timer = testIfEventCalled();
    addon.on('host_settings_saved', function(key, settings){
      addon.settings.get(key).then(function(d){
        assert.deepEqual(d, settings);
        eventFired(timer, done, function(done){
          done();
        });
      });
    });
  });

  it('should have webhook listener for remote_plugin_installed', function(done){
    assert.equal(EventEmitter.listenerCount(addon, 'remote_plugin_installed'), 1);
    done();
  });

  it('should also deregister if a SIGINT is encountered', function(done){
    process.kill(process.pid, 'SIGINT');
    var timer = testIfEventCalled();
    addon.on('addon_deregistered', function(){ eventFired(timer, done); });
  });

});