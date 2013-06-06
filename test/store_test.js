var helper = require('./test_helper');
var assert = require('assert');
var http = require('http');
var express = require('express');
var app = express();
var feebs = require('../index');
var request = require('request')
var sinon = require('sinon');
var addon = {};

describe('Store', function(){
  var server = {};
  var Schema = require('jugglingdb').Schema;

  before(function(done){
    app.set('env','development');
    app.use(express.bodyParser());

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
      res.send(200);
    });

    addon = feebs(app, {
      config: {
        development: {
          // optional. If omitted, the memory store is used
          db: new Schema('postgres',{
            database: "postgres",
            username: "rmanalang",
            host: "localhost",
            debug:true
          }),
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

  it('should store client info', function(done){
    var AddonSettings = addon.schema.models.AddonSettings;
    AddonSettings.all({
      where: {
        clientKey: "Confluence:5413647675"
      }
    },
    function(err, model){
      done();
    });
  });

  it('should allow storage of arbitrary models', function(done){
    var User = addon.schema.define('User', {
      name:         String,
      email:        String
    });
    User.schema.isActual(function(err, actual) {
      if (!actual) {
          User.schema.automigrate();
      }
    });
    User.create({
      name: "Rich",
      email: "rich@example.com"
    }, function(err, model){
      assert.equal(model.name, "Rich");
      done();
    });
  });


});