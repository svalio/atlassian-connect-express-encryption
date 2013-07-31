var helper = require('./test_helper');
var assert = require('assert');
var http = require('http');
var express = require('express');
var app = express();
var ac = require('../index');
var request = require('request')
var sinon = require('sinon');
var logger = require('./logger');
var oauth = require('./oauth_helper');
var addon = {};

describe('Webhook', function(){
  var server;
  var hostServer;

  before(function(done){
    process.env.AC_OPTS = '';
    ac.store.register('test', require('./test_store'));
    addon = ac(app, {
      config: {
        development: {
          localBaseUrl: 'http://localhost:$port',
          port: 3001,
          store: {
            adapter: 'test'
          }
        }
      }
    }, logger);
    app.set('env', 'development');
    var port = addon.config.port();
    app.set('port', port);
    app.use(express.bodyParser());
    app.use(express.cookieParser());
    app.use(express.cookieSession({
      key: 'session',
      secret: addon.config.secret()
    }));
    app.use(addon.middleware());

    var host = express();
    host.get('/plugins/servlet/oauth/consumer-info', function (req, res) {
      res.set('Content-Type', 'application/xml');
      res.send(200, helper.consumerInfo);
    });
    hostServer = http.createServer(host).listen(3002, function(){
      server = http.createServer(app).listen(port, function(){
        done();
      });
    });
  });

  after(function(done){
    process.env.AC_OPTS = 'no-oauth';
    server.close();
    hostServer.close();
    done();
  });

  function fireTestWebhook(route, body) {
    // this should be improved by re-enabling oauth in tests and sending a real, signed webhook url here
    var url = 'http://localhost:3001' + route + '?user_id=admin';
    request.post(url, {
      headers: {Authorization: oauth.signAsHeader({
        method: 'POST',
        url: url,
        clientKey: 'testHostClientKey'
      })},
      jar: false,
      json: body
    }, function (err, res) {
      assert.equal(err, null);
      assert.equal(res.statusCode, 204, res.body);
    });
  }

  it('should fire an add-on event', function(done){
    addon.once('remote_plugin_test_hook', function (key, body, req) {
      assert(key === 'test_hook');
      assert(body != null && body.foo === 'bar');
      assert(req && req.param('user_id') === 'admin');
      done();
    });

    fireTestWebhook('/test-hook', {foo: 'bar'});
  });

  it('should perform special oauth verification for the enabled webhook', function(done){
    var spy = sinon.spy();
    addon.once('enabled_webhook_oauth_verification_triggered', spy);

    addon.once('remote_plugin_enabled', function (key, body, req) {
      assert(spy.called);
      done();
    });

    fireTestWebhook('/enabled', helper.clientInfo);
  });

  it('should perform normal oauth verification for other webhooks', function(done){
    var spy = sinon.spy();
    addon.once('other_webhook_oauth_verification_triggered', spy);

    addon.once('remote_plugin_test_hook', function (key, body, req) {
      assert(spy.called);
      done();
    });

    fireTestWebhook('/test-hook', {foo: 'bar'});
  });

});
