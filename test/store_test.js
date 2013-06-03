var helper = require('./test_helper');
var assert = require('assert');
var http = require('http');
var express = require('express');
var app = express();
var feebs = require('../index');
var request = require('request')
var Schema = require('jugglingdb').Schema;
var schema = new Schema('memory');
var sinon = require('sinon');
var addon = {};

describe('Store', function(){
  var server = {};

  before(function(done){
    app.set('env','development');
    app.use(express.bodyParser());
    addon = feebs(app, {
      config: {
        development: {
          db: schema
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

  it('should store client info in memory store', function(done){
    done();
  });


});