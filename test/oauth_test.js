var helper = require('./test_helper');
var assert = require('assert');
var http = require('http');
var express = require('express');
var app = express();
var feebs = require('../index');
var request = require('request')
var sinon = require('sinon');
var logger = require('./logger');
var addon = {};

describe('OAuth', function(){
  var server = {};

  before(function(done){
    app.set('env','development');
    app.use(express.bodyParser());
    addon = feebs(app, {
      config: {
        development: {}
      }
    }, logger);

    server = http.createServer(app).listen(3001, function(){
      addon.register();
      done();
    });
  });

  after(function(done){
    server.close();
    done();
  });

  it('should be triggered when middleware is activated', function(done){
    var spy = sinon.spy();
    addon.on('oauth_verification_triggered', spy);
    addon.authenticate();
    assert(spy.called);
    done();
  });


});