var helper = require('./test_helper');
var assert = require('assert');
var http = require('http');
var express = require('express');
var app = express();
var feebs = require('../index');
var addon = {};

describe('Configuration', function(){
  var server = {};

  before(function(done){
    app.set('env','development');
    addon = feebs(app, {
      config: {
        "development": {
          "watch": false
        }
      }
    });
    server = http.createServer(app).listen(3001, function(){
      done();
    });
  });

  after(function(done){
    server.close();
    done();
  });

  it('should be parsed as an object', function(done){
    assert.equal(typeof addon.config, 'object');
    done();
  });

  it('should allow you to disable re-registration on plugin.xml change',function(done){
    assert(!addon.config.watch());
    done();
  });

});