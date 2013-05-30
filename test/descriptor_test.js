var helper = require('./test_helper');
var assert = require('assert');
var http = require('http');
var express = require('express');
var app = express();
var feebs = require('../index');
var addon = {};

describe('Descriptor', function(){
  var server = {};

  before(function(done){
    app.set('env','development');
    addon = feebs(app, {
      config: {
        development:{}
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
    assert.equal(typeof addon.descriptor, 'object');
    done();
  });


});