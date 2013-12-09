var helper = require('./test_helper');
var assert = require('assert');
var http = require('http');
var express = require('express');
var app = express();
var ac = require('../index');
var request = require('request')
var sinon = require('sinon');
var os = require('os');
var logger = require('./logger');
var oauth = require('./oauth_helper');
var token = require('../lib/internal/token');
var encode = encodeURIComponent;

var addon = {};

var host = 'http://www.example.com';
var clientKey = 'XYZ0-6789-KHGL';
var userId = 'admin';


describe('Token verification', function(){
  var server;

  before(function(done){
    app.set('env', 'development');
    addon = ac(app, {
      config: {
        "development": {
          "allowTokenRefresh": true
        }
      }
    }, logger);
    app.use(express.bodyParser());
    app.use(express.cookieParser());
    app.use(express.cookieSession({
      key: 'session',
      secret: addon.config.secret()
    }));
    app.use(addon.middleware());
    server = http.createServer(app).listen(3001, function(){
      done();
    });
  });

  after(function(done){
    server.close();
    done();
  });

  it('should preserve the original values in the encoding/decoding process', function(done){

    var tokens = initTokens();
    var encodedToken = tokens.create(host, clientKey, userId);

    tokens.verify(encodedToken, addon.config.maxTokenAge(),
      function(decodedToken) {
        assert.equal(host, decodedToken.h);
        assert.equal(clientKey, decodedToken.k);
        assert.equal(userId, decodedToken.u);
        done();
      },
      function(err) {
        assert.fail('Validation failed: ' + err.message);
        done();
      }
    );
  });

  it('should fail on altered tokens', function(done){

    var tokens = initTokens();
    var encodedToken = tokens.create(host, clientKey, userId);

    var alteredToken = encodedToken + "A9";

    tokens.verify(alteredToken, addon.config.maxTokenAge(),
      function(decodedToken) {
        assert.fail('Should have thrown an Invalid Signature error');
        done();
      },
      function(err) {
        assert.ok(err.message.indexOf('Invalid signature') > -1, 'Message should contain "Invalid signature": ' + err.message);
        done();
      }
    );
  });

  it('should fail on expired tokens', function(done){

    var tokens = initTokens();
    var encodedToken = tokens.create(host, clientKey, userId);

    tokens.verify(encodedToken, -1000,
      function(decodedToken) {
        assert.fail('Should have thrown a Token Expired error');
        done();
      },
      function(err) {
        assert.ok(err.message.indexOf('expired') > -1, 'Message should contain "expired": ' + err.message);
        done();
      }
    );
  });

  it('should preserve the host, clientKey and user from the original signed oauth request', function(done){

    app.get(
      '/protected_resource',
      addon.authenticate(),
      function (req, res) {
        res.send(res.locals.token);
      }
    );

    var tokens = initTokens();
    var host = 'http://example.com:5678';
    var key = 'jira:4567-ABCD';
    var userId = 'admin';

    var signedUrl = oauth.signAsUrl({
      url: 'http://localhost:3001/protected_resource?xdm_e=' + encode(host) + '&user_id=' + encode(userId),
      clientKey: key
    });

    request(signedUrl, {jar: false}, function (err, res, body) {
      assert.equal(err, null);
      assert.equal(res.statusCode, 200);
      tokens.verify(body, addon.config.maxTokenAge(),
        function(verifiedToken) {
          assert.equal(host, verifiedToken.h);
          assert.equal(key, verifiedToken.k);
          assert.equal(userId, verifiedToken.u);
          done();
        },
        function(err) {
          assert.fail('Token validation failed');
          done();
        }
      );
    });

  });

  function initTokens() {
    return token(addon.config.privateKey(), addon.config.publicKey());
  }

});
