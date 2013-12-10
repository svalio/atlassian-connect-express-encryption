var helper = require('./test_helper');
var assert = require('assert');
var http = require('http');
var express = require('express');
var app = express();
var ac = require('../index');
var request = require('request');
var os = require('os');
var logger = require('./logger');
var oauth = require('./oauth_helper');
var token = require('../lib/internal/token');
var encode = encodeURIComponent;

var addon = {};

var HOST = 'http://www.example.com:5678';
var CLIENT_KEY = 'jira:XYZ0-6789-KHGL';
var USER_ID = 'admin';

describe('Token verification', function() {
  var server;

  before(function(done) {
    process.env.AC_OPTS = '';
    ac.store.register('test', require('./test_store'));
    addon = ac(app, {
      config: {
        development: {
          localBaseUrl: 'http://localhost:$port',
          port: 3001,
          "maxTokenAge": 100,
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

  after(function(done) {
    server.close();
    process.env.AC_OPTS = 'no-oauth';
    done();
  });

  it('should preserve the original values in the encoding/decoding process', function(done) {
    var tokens = initTokens();
    var encodedToken = tokens.create(HOST, CLIENT_KEY, USER_ID);
    tokens.verify(encodedToken, addon.config.maxTokenAge(),
      function(decodedToken) {
        assert.equal(decodedToken.host, HOST);
        assert.equal(decodedToken.key, CLIENT_KEY);
        assert.equal(decodedToken.user, USER_ID);
        done();
      },
      function(err) {
        assert.fail('Validation failed: ' + err.message);
        done();
      }
    );
  });

  it('should fail on altered tokens', function(done) {
    var tokens = initTokens();
    var encodedToken = tokens.create(HOST, CLIENT_KEY, USER_ID);
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

  it('should fail on expired tokens', function(done) {
    var tokens = initTokens();
    var encodedToken = tokens.create(HOST, CLIENT_KEY, USER_ID);
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

  it('should preserve the host, clientKey and user from the original signed oauth request', function(done) {
    app.get(
      '/protected_resource1',
      addon.authenticate(),
      function (req, res) {
        res.send(res.locals.token);
      }
    );
    var tokens = initTokens();
    var signedUrl = oauth.signAsUrl({
      url: 'http://localhost:3001/protected_resource1?xdm_e=' + encode(HOST) + '&user_id=' + encode(USER_ID),
      clientKey: 'testHostClientKey'
    });
    request(signedUrl, {jar: false}, function (err, res, body) {
      assert.equal(err, null);
      assert.equal(res.statusCode, 200);
      tokens.verify(body, addon.config.maxTokenAge(),
        function(verifiedToken) {
          assert.equal(verifiedToken.host, HOST);
          assert.equal(verifiedToken.key, 'testHostClientKey');
          assert.equal(verifiedToken.user, USER_ID);
          done();
        },
        function(err) {
          assert.fail('Token validation failed: ' + err.message);
          done();
        }
      );
    });
  });

  it('should allow requests with valid tokens', function(done) {
    app.get(
      '/protected_resource2',
      addon.checkValidToken(),
      function (req, res) {
        res.send("success");
      }
    );
    var tokens = initTokens();
    var encodedToken = tokens.create(HOST, CLIENT_KEY, USER_ID);
    var tokenUrl = 'http://localhost:3001/protected_resource2?acpt=' + encode(encodedToken);
    request(tokenUrl, {jar: false}, function (err, res, body) {
      assert.equal(err, null);
      assert.equal(res.statusCode, 200);
      assert.equal(body, "success");
      done();
    });
  });

  it('should reject requests with no token', function(done) {
    app.get(
      '/protected_resource3',
      addon.checkValidToken(),
      function (req, res) {
        res.send("success");
      }
    );
    var tokenUrl = 'http://localhost:3001/protected_resource3';
    request(tokenUrl, {jar: false}, function (err, res) {
      assert.equal(err, null);
      assert.equal(res.statusCode, 401);
      done();
    });
  });

  it('should reject requests with invalid tokens', function(done) {
    app.get(
      '/protected_resource4',
      addon.checkValidToken(),
      function (req, res) {
        res.send("success");
      }
    );
    var tokenUrl = 'http://localhost:3001/protected_resource4?acpt=' + encode("An invalid token");
    request(tokenUrl, {jar: false}, function (err, res) {
      assert.equal(err, null);
      assert.equal(res.statusCode, 401);
      done();
    });
  });

  it('should rehydrate response local variables from the token', function(done) {
    app.get(
      '/protected_resource5',
      addon.checkValidToken(),
      function (req, res) {
        res.send({
          clientKey: res.locals.clientKey,
          token: res.locals.token,
          userId: res.locals.userId,
          hostBaseUrl: res.locals.hostBaseUrl,
          hostStylesheetUrl: res.locals.hostStylesheetUrl,
          hostScriptUrl: res.locals.hostScriptUrl
        });
      }
    );
    var tokens = initTokens();
    var encodedToken = tokens.create(HOST, CLIENT_KEY, USER_ID);
    var tokenUrl = 'http://localhost:3001/protected_resource5?acpt=' + encode(encodedToken);
    request(tokenUrl, {jar: false}, function (err, res, body) {
      var payload = JSON.parse(body);
      assert.equal(null, err);
      assert.equal(200, res.statusCode);
      assert.equal(payload.clientKey, CLIENT_KEY);
      assert.equal(payload.userId, USER_ID);
      assert.equal(payload.hostBaseUrl, HOST);
      assert.equal(payload.hostStylesheetUrl, hostResourceUrl(app, HOST, 'css'));
      assert.equal(payload.hostScriptUrl, hostResourceUrl(app, HOST, 'js'));
      tokens.verify(payload.token, addon.config.maxTokenAge(),
        function(decodedToken) {
        },
        function(err) {
          assert.fail('Invalid token');
        }
      );
      done();
    });
  });

  it('should not create tokens for requests without verified OAuth signatures', function(done) {
    app.get(
      '/protected_resource6',
      function (req, res) {
        res.send(undefined === res.locals.token ? "no token" : res.locals.token);
      }
    );
    var tokenUrl = 'http://localhost:3001/protected_resource6?xdm_e=' + encode(HOST)
      + '&user_id=' + encode(USER_ID)
      + '&oauth_consumer_key=' + encode(CLIENT_KEY);
    request(tokenUrl, {jar: false}, function (err, res, body) {
      assert.equal(err, null);
      assert.equal(res.statusCode, 200);
      assert.equal(body, "no token");
      done();
    });
  });

  function initTokens() {
    return token(addon.config.privateKey(), addon.config.publicKey());
  }

  function hostResourceUrl(app, baseUrl, type) {
    var suffix = app.get('env') === 'development' ? '-debug' : '';
    return baseUrl + '/atlassian-connect/all' + suffix + '.' + type;
  }

});
