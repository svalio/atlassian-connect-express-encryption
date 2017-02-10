var helper = require('./test_helper');
var assert = require('assert');
var http = require('http');
var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var ac = require('../index');
var request = require('request');
var moment = require('moment');
var jwt = require('atlassian-jwt');
var logger = require('./logger');
var _ = require('lodash');

var addon = {};

var USER_ID = 'admin';
var JWT_AUTH_RESPONDER_PATH = '/jwt_auth_responder';
var CHECK_TOKEN_RESPONDER_PATH = '/check_token_responder';

describe('Token verification', function () {
    var server;
    var useBodyParser = true;

    function conditionalUseBodyParser(fn) {
        return function(req, res, next) {
            if (useBodyParser) {
                fn(req, res, next);
            } else {
                next();
            }
        }
    }

    before(function (done) {
        app.set('env', 'development');
        app.use(conditionalUseBodyParser(bodyParser.urlencoded({extended: false})));
        app.use(conditionalUseBodyParser(bodyParser.json()));

        // configure test store
        ac.store.register("teststore", function (logger, opts) {
            return require("../lib/store/jugglingdb")(logger, opts);
        });

        // configure add-on
        addon = ac(app, {
            config: {
                "development": {
                    store: {
                        adapter: 'teststore',
                        type: "memory"
                    },
                    "hosts": [
                        helper.productBaseUrl
                    ]
                }
            }
        }, logger, function () {
            request({
                url: helper.addonBaseUrl + '/installed',
                method: 'POST',
                json: helper.installedPayload
            }, function (err, res) {
                assert.equal(res.statusCode, 204, "Install hook failed");
                done();
            });
        });

        // Include the goodies
        app.use(addon.middleware());

        // default test routes
        var routeArgs = [
            JWT_AUTH_RESPONDER_PATH,
            addon.authenticate(),
            function (req, res) {
                var token = res.locals.token;
                res.send(token);
            }
        ];
        app.get.apply(app, routeArgs);
        app.post.apply(app, routeArgs);

        app.get(
            CHECK_TOKEN_RESPONDER_PATH,
            addon.checkValidToken(),
            function (req, res) {
                var token = res.locals.token;
                res.send(token);
            }
        );

        // start server
        server = http.createServer(app).listen(helper.addonPort);
    });

    after(function (done) {
        server.close();
        done();
    });

    afterEach(function() {
        useBodyParser = true;
    });

    function createJwtToken(req, secret, iss) {
        var jwtPayload = {
            "sub": USER_ID,
            "iss": iss || helper.installedPayload.clientKey,
            "iat": moment().utc().unix(),
            "exp": moment().utc().add(10, 'minutes').unix()
        };

        if (req) {
            jwtPayload.qsh = jwt.createQueryStringHash(req);
        }

        return jwt.encode(jwtPayload, secret || helper.installedPayload.sharedSecret);
    }

    function createRequestOptions(path, jwt, method) {
        method = (method || 'GET').toUpperCase();

        var data = {
            "xdm_e": helper.productBaseUrl,
            "jwt": jwt || createJwtToken({
                // mock the request
                method: method,
                path: path,
                query: {
                    "xdm_e": helper.productBaseUrl
                }
            })
        };

        var option = {
            method: method,
            jar: false
        };

        if (method === 'GET') {
            option['qs'] = data;
        } else {
            option['form'] = data;
        }

        return option;
    }

    function createTokenRequestOptions(token) {
        return {
            qs: {
                "acpt": token
            },
            jar: false
        };
    }

    function isBase64EncodedJson(value) {
        return value && (value.indexOf("ey") == 0);
    }

    it('should generate a token for authenticated GET requests', function (done) {
        var requestUrl = helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH;
        var requestOpts = createRequestOptions(JWT_AUTH_RESPONDER_PATH);

        request(requestUrl, requestOpts, function (err, res, body) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 200);
            assert.ok(isBase64EncodedJson(body));
            assert.ok(isBase64EncodedJson(res.headers['x-acpt']));
            done();
        });
    });

    it('should generate a token for authenticated POST requests', function (done) {
        var requestUrl = helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH;
        var requestOpts = createRequestOptions(JWT_AUTH_RESPONDER_PATH, undefined, 'POST');

        request(requestUrl, requestOpts, function (err, res, body) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 200);
            assert.ok(isBase64EncodedJson(body));
            assert.ok(isBase64EncodedJson(res.headers['x-acpt']));
            done();
        });
    });

    it('should not create tokens for unauthenticated GET requests', function (done) {
        app.get(
            '/unprotected',
            function (req, res) {
                res.send(!res.locals.token ? "no token" : res.locals.token);
            }
        );

        var requestUrl = helper.addonBaseUrl + '/unprotected';
        var requestOpts = {
            qs: {
                "xdm_e": helper.productBaseUrl,
                "user_id": USER_ID
            },
            jar: false
        };
        request(requestUrl, requestOpts, function (err, res, body) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 200);
            assert.equal(body, "no token");
            done();
        });
    });

    it('should not create tokens for unauthenticated POST requests', function (done) {
        app.post(
            '/unprotected',
            function (req, res) {
                res.send(!res.locals.token ? "no token" : res.locals.token);
            }
        );

        var requestUrl = helper.addonBaseUrl + '/unprotected';
        var requestOpts = {
            method: 'POST',
            form: {
                "xdm_e": helper.productBaseUrl,
                "user_id": USER_ID
            },
            jar: false
        };
        request(requestUrl, requestOpts, function (err, res, body) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 200);
            assert.equal(body, "no token");
            done();
        });
    });

    it('should preserve the clientKey and user from the original signed request', function (done) {
        var requestUrl = helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH;
        var requestOpts = createRequestOptions(JWT_AUTH_RESPONDER_PATH);

        request(requestUrl, requestOpts, function (err, res, theToken) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 200);

            var verifiedToken = jwt.decode(theToken, helper.installedPayload.sharedSecret);
            assert.equal(verifiedToken.aud[0], helper.installedPayload.clientKey);
            assert.equal(verifiedToken.sub, USER_ID);
            done();
        });
    });

    it('should allow requests with valid tokens using the checkValidToken middleware', function (done) {
        var requestUrl = helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH;
        var requestOpts = createRequestOptions(JWT_AUTH_RESPONDER_PATH);

        request(requestUrl, requestOpts, function (err, res, theToken) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 200);

            var tokenUrl = helper.addonBaseUrl + CHECK_TOKEN_RESPONDER_PATH;
            var tokenRequestOpts = createTokenRequestOptions(theToken);

            request(tokenUrl, tokenRequestOpts, function (err, res) {
                assert.equal(err, null);
                assert.equal(res.statusCode, 200);
                done();
            });
        });
    });

    it('should not allow requests with valid tokens using the authenticate middleware', function (done) {
        var requestUrl = helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH;
        var requestOpts = createRequestOptions(JWT_AUTH_RESPONDER_PATH);

        request(requestUrl, requestOpts, function (err, res, theToken) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 200);

            var tokenUrl = helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH;
            var tokenRequestOpts = createRequestOptions(JWT_AUTH_RESPONDER_PATH, theToken);

            request(tokenUrl, tokenRequestOpts, function (err, res) {
                assert.equal(err, null);
                assert.equal(res.statusCode, 401);
                done();
            });
        });
    });

    it('should reject requests with no token', function (done) {
        var requestUrl = helper.addonBaseUrl + CHECK_TOKEN_RESPONDER_PATH;
        request(requestUrl, {jar: false}, function (err, res) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 401);
            done();
        });
    });

    it('should reject requests with no token in query and no request body', function (done) {
        useBodyParser = false;
        var requestUrl = helper.addonBaseUrl + CHECK_TOKEN_RESPONDER_PATH;
        request(requestUrl, {jar: false}, function (err, res) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 401);
            done();
        });
    });

    it('should not throw exception if request body is undefined', function (done) {
        useBodyParser = false;
        app.post(
          '/return-host',
          function (req, res) {
              res.send(res.locals.hostBaseUrl);
          }
        );

        var requestUrl = helper.addonBaseUrl + '/return-host';
        var requestOpts = {
            method: 'POST',
            form: {
                "xdm_e": 'xdm_e_value'
            },
            jar: false
        };
        request(requestUrl, requestOpts, function (err, res) {
            assert.equal(err, null);
            assert.equal(res.body, '');
            done();
        });
    });

    it('should reject requests with token appeared in both query and body', function (done) {
        var requestUrl = helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH + '?jwt=token_in_query';
        var requestOpts = {
            method: 'POST',
            form: {
                "jwt": 'token_in_body'
            },
            jar: false
        };
        request(requestUrl, requestOpts, function (err, res) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 401);
            done();
        });
    });

    it('should use token from query parameter if appears both in body and header', function (done) {
        var requestUrl = helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH + '?jwt=token_in_query';
        var requestOpts = {
            headers: {
                'Authorization': 'JWT token_in_header'
            },
            jar: false
        };
        request(requestUrl, requestOpts, function (err, res) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 401);
            done();
        });
    });

    it('should use token from request body if appears both in body and header', function (done) {
        var requestUrl = helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH;
        var requestOpts = {
            method: 'POST',
            headers: {
                'Authorization': 'JWT token_in_header'
            },
            form: {
                "jwt": 'token_in_body'
            },
            jar: false
        };
        request(requestUrl, requestOpts, function (err, res) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 401);
            done();
        });
    });

    it('should reject requests with invalid tokens', function (done) {
        var requestUrl = helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH;
        var requestOpts = createTokenRequestOptions("invalid");
        request(requestUrl, requestOpts, function (err, res) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 401);
            done();
        });
    });

    it('should rehydrate response local variables from the token', function (done) {
        app.get(
            '/protected_resource',
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

        var requestUrl = helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH;
        var requestOpts = createRequestOptions(JWT_AUTH_RESPONDER_PATH);

        request(requestUrl, requestOpts, function (err, res, theToken) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 200);

            var tokenUrl = helper.addonBaseUrl + '/protected_resource';
            var tokenRequestOpts = createTokenRequestOptions(theToken);

            request(tokenUrl, tokenRequestOpts, function (err, res, body) {
                var payload = JSON.parse(body);
                assert.equal(null, err);
                assert.equal(200, res.statusCode);
                assert.equal(payload.clientKey, helper.installedPayload.clientKey);
                assert.equal(payload.userId, USER_ID);
                assert.equal(payload.hostBaseUrl, helper.productBaseUrl);
                assert.equal(payload.hostStylesheetUrl, hostResourceUrl(app, helper.productBaseUrl, 'css'));
                assert.equal(payload.hostScriptUrl, hostResourceUrl(app, helper.productBaseUrl, 'js'));
                jwt.decode(payload.token, helper.installedPayload.sharedSecret);
                done();
            });
        });
    });

    it('should check for a token on reinstall', function (done) {
        request({
            url: helper.addonBaseUrl + '/installed',
            method: 'POST',
            json: helper.installedPayload
        }, function (err, res) {
            assert.equal(res.statusCode, 401, "re-installation not verified");
            done();
        });
    });

    it('should validate token using old secret on reinstall', function (done) {
        request({
            url: helper.addonBaseUrl + '/installed',
            method: 'POST',
            json: _.extend({}, helper.installedPayload),
            headers: {
                'Authorization': 'JWT ' + createJwtToken({
                    method: 'POST',
                    path: '/installed'
                })
            }
        }, function (err, res) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 204, "signed reinstall request should have been accepted");
            done();
        });
    });

    it('should not accept reinstall request signed with new secret', function (done) {
        var newSecret = 'newSharedSecret';
        request({
            url: helper.addonBaseUrl + '/installed',
            method: 'POST',
            json: _.extend({}, helper.installedPayload, {sharedSecret: newSecret}),
            headers: {
                'Authorization': 'JWT ' + createJwtToken({
                    method: 'POST',
                    path: '/installed'
                }, newSecret)
            }
        }, function (err, res) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 400, "reinstall request signed with old secret should not have been accepted");
            done();
        });
    });

    it('should only accept install requests for the authenticated client', function (done) {
        var maliciousSecret = 'mwahaha';
        var maliciousClient = _.extend({}, helper.installedPayload, {
            sharedSecret: maliciousSecret,
            clientKey: 'crafty-client'
        });
        request({
            url: helper.addonBaseUrl + '/installed',
            method: 'POST',
            json: maliciousClient
        });
        request({
            url: helper.addonBaseUrl + '/installed',
            method: 'POST',
            json: _.extend({}, helper.installedPayload, {sharedSecret: 'newSharedSecret'}),
            headers: {
                'Authorization': 'JWT ' + createJwtToken({
                    method: 'POST',
                    path: '/installed'
                }, maliciousSecret, maliciousClient.clientKey)
            }
        }, function (err, res) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 401,
                "reinstall request authenticated as the wrong client should not have been accepted");
            done();
        });

    });

    function hostResourceUrl(app, baseUrl, type) {
        var suffix = app.get('env') === 'development' ? '-debug' : '';
        return baseUrl + '/atlassian-connect/all' + suffix + '.' + type;
    }

});
