var helper = require('./test_helper');
var assert = require('assert');
var http = require('http');
var express = require('express');
var app = express();
var feebs = require('../index');
var request = require('request')
var RSVP = require('rsvp');
var Schema = require('jugglingdb').Schema;
var addon = {};
var spy = require("sinon").spy;

describe('Store', function(){
  var server = {};
  var addOnSettings = {
    baseUrl: 'http://localhost:3001/confluence',
    publicKey: 'MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCqgmc8W+aK5kc30gl7fhrmT++GalK1T/CvCN9SqW8M7Zr8QnWx8+Ml5zIgExhc7nuFr9Jh15g1FlbQfU2cvhAVoSbNxyDiyEmA0hajJwp59D7+rjVree6B/0a1O91BAIWGgttRigGSuQFytHQ22Yd6lNaM1tw1Pu63cLyTkmDlvwIDAQAB',
    description: 'host.consumer.default.description',
    pluginsVersion: '0.6.1010',
    clientKey: 'Confluence:5413647675',
    serverVersion: '4307',
    key: 'webhook-inspector',
    productType: 'confluence'
  };

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
        json: addOnSettings
      });
      res.send(200);
    });

    feebs.store.register("teststore", function (logger, opts) {
      var store = require("../lib/store/jugglingdb")(logger, opts);
      spy(store, "get");
      spy(store, "set");
      spy(store, "del");
      return store;
    });

    addon = feebs(app, {
      config: {
        development: {
          store: {
            adapter: "teststore",
            type: "memory"
          },
          hosts: [
            "http://admin:admin@localhost:3001/confluence"
          ]
        }
      }
    });

    server = http.createServer(app).listen(3001, function(){
      addon.register().then(function(){
        done();
      });
    });
  });

  after(function(done){
    server.close(function(){
      done();
    });
  });

  it('should store client info', function(done){
    addon.on('host_settings_saved', function(err, settings){
      addon.settings.get('clientInfo', addOnSettings.clientKey).then(function(settings){
        assert(settings.clientKey, addOnSettings.clientKey);
        done();
      }).then(null, done);
    });
  });

  it('should allow storing arbitrary key/values', function(done){
    addon.settings.set('arbitrarySetting', 'someValue', addOnSettings.clientKey).then(function(setting){
      assert(setting.val, '\"someValue\"');
      done();
    })
  });

  it('should allow storing arbitrary key/values as JSON', function(done){
    addon.settings.set('arbitrarySetting2', {data: 1}, addOnSettings.clientKey).then(function(setting){
      assert(setting.val, { data: 1});
      done();
    })
  });

  it('should allow storage of arbitrary models', function(done){
    addon.schema.extend('User', {
      name:         String,
      email:        String,
      bio:          Schema.JSON
    }).then(
      function (User) {
        User.create({
          name: "Rich",
          email: "rich@example.com",
          bio: {
            description: "Male 6' tall",
            favoriteColors: [
              "blue",
              "green"
            ]
          }
        }, function(err, model){
          assert.equal(model.name, "Rich");
          User.all({ name: "Rich" }, function(err, user){
            assert.equal(user[0].name, model.name);
            done();
          });
        });
      },
      function (err) {
        console.error(err);
        assert.fail();
      }
    );
  });

  it('should work with a custom store', function (done) {
    var promises = [
      addon.settings.set('custom key', 'custom value'),
      addon.settings.get('custom key'),
      addon.settings.del('custom key')
    ];
    RSVP.all(promises).then(function () {
      assert.ok(addon.settings.set.callCount > 0);
      assert.ok(addon.settings.get.callCount > 0);
      assert.ok(addon.settings.del.callCount > 0);
      done();
    }, function (err) {
      assert.fail(err);
    });
  });

});
