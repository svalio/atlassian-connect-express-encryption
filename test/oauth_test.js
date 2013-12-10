var helper = require('./test_helper');
var assert = require('assert');
var http = require('http');
var express = require('express');
var app = express();
var ac = require('../index');
var request = require('request');
var sinon = require('sinon');
var os = require('os');
var logger = require('./logger');
var oauth = require('./oauth_helper');
var addon = {};

describe('OAuth', function(){
  var server;

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

    server = http.createServer(app).listen(port, function(){
      done();
    });
  });

  after(function(done){
    process.env.AC_OPTS = 'no-oauth';
    server.close();
    done();
  });

  it('should oauth-verify routes that require authentication', function(done){
    var triggered = sinon.spy();
    addon.once('oauth_verification_triggered', triggered);
    var successful = sinon.spy();
    addon.once('oauth_verification_successful', successful);

    app.get(
      '/oauth-pass',
      addon.authenticate(),
      function (req, res) {
        res.send(204);
      }
    );

    var signedUrl = oauth.signAsUrl({
      url: 'http://localhost:3001/oauth-pass?xdm_e=test',
      clientKey: 'testHostClientKey'
    });
    request(signedUrl, {jar: false}, function (err, res) {
      assert.equal(err, null);
      assert.equal(res.statusCode, 204);
      assert.ok(triggered.called);
      assert.ok(successful.called);
      done();
    });

  });

  it('should fail to oauth-verify with an unknown client key', function(done){
    var triggered = sinon.spy();
    addon.once('oauth_verification_triggered', triggered);
    var successful = sinon.spy();
    addon.once('oauth_verification_successful', successful);

    app.get(
      '/oauth-unknown-key',
      addon.authenticate(),
      function (req, res) {
        res.send(204);
      }
    );

    var signedUrl = oauth.signAsUrl({
      url: 'http://localhost:3001/oauth-unknown-key?xdm_e=test',
      clientKey: 'unknownClientKey'
    });
    request(signedUrl, {jar: false}, function (err, res) {
      assert.equal(err, null);
      assert.equal(res.statusCode, 401);
      assert.equal(res.body, 'OAuth consumer unknownClientKey not approved to make requests.');
      assert.ok(triggered.called);
      assert.ok(!successful.called);
      addon.removeListener('oauth_verification_successful', successful);
      done();
    });

  });

  it('should fail to oauth-verify when signed with a bad private key', function(done){
    var triggered = sinon.spy();
    addon.once('oauth_verification_triggered', triggered);
    var successful = sinon.spy();
    addon.once('oauth_verification_successful', successful);

    app.get(
      '/oauth-bad-private-key',
      addon.authenticate(),
      function (req, res) {
        res.send(204);
      }
    );

    var signedUrl = oauth.signAsUrl({
      url: 'http://localhost:3001/oauth-bad-private-key?xdm_e=test',
      clientKey: 'testHostClientKey',
      privateKey: process.env.AC_PRIVATE_KEY.replace('MIIEpA', 'FOOBAR')
    });
    request(signedUrl, {jar: false}, function (err, res) {
      assert.equal(err, null);
      assert.equal(res.statusCode, 401);
      assert.equal(res.body, 'OAuth request not authenticated: Invalid signature');
      assert.ok(triggered.called);
      assert.ok(!successful.called);
      addon.removeListener('oauth_verification_successful', successful);
      done();
    });

  });

  it('should not oauth-verify unprotected routes', function(done){
    var triggered = sinon.spy();
    addon.once('oauth_verification_triggered', triggered);
    var successful = sinon.spy();
    addon.once('oauth_verification_successful', successful);

    app.get(
      '/unprotected',
      function (req, res) {
        res.send(200, 'Yay');
      }
    );

    request('http://localhost:3001/unprotected', {jar: false}, function (err, res) {
      assert.equal(err, null);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body, 'Yay');
      assert.ok(!triggered.called);
      addon.removeListener('oauth_verification_successful', triggered);
      assert.ok(!successful.called);
      addon.removeListener('oauth_verification_successful', successful);
      done();
    });

  });

});
