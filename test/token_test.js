var helper = require('./test_helper');
var assert = require('assert');
var http = require('http');
var express = require('express');
var app = express();
var ac = require('../index');
var request = require('request');
var moment = require('moment');
var jwt = require('../lib/internal/jwt');
var logger = require('./logger');
var token = require('../lib/internal/token');

var addon = {};

var USER_ID = 'admin';

describe('Token verification', function () {
    var server;

    before(function (done) {
        app.set('env', 'development');
        app.use(express.urlencoded());
        app.use(express.json());

        // mock host
        app.get('/confluence/plugins/servlet/oauth/consumer-info', function (req, res) {
            res.set('Content-Type', 'application/xml');
            res.send(200, helper.consumerInfo);
        });

        app.head("/confluence/rest/plugins/1.0/", function (req, res) {
            res.setHeader("upm-token", "123");
            res.send(200);
        });

        app.get("/confluence/rest/plugins/1.0/", function(req, res) {
            res.json({plugins: []});
        });

        // Post request to UPM installer

        app.post("/confluence/rest/plugins/1.0/", function (req, res) {
            request({
                url: helper.addonBaseUrl + '/installed',
                qs: {
                    jwt: createJwtToken()
                },
                method: 'POST',
                json: helper.installedPayload
            });
            res.send(200);
        });

        ac.store.register("teststore", function (logger, opts) {
            return require("../lib/store/jugglingdb")(logger, opts);
        });

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
        }, logger);
        server = http.createServer(app).listen(helper.addonPort, function () {
            addon.register().then(done);
        });
    });

    after(function (done) {
        server.close();
        done();
    });

    function createJwtToken(req) {
        var jwtPayload = {
            "sub": USER_ID,
            "iss": helper.installedPayload.clientKey,
            "iat": moment().utc().unix(),
            "exp": moment().utc().add('minutes', 10).unix()
        };

        if (req) {
            jwtPayload.qsh = jwt.createQueryStringHash(req);
        }

        return jwt.encode(jwtPayload, helper.installedPayload.sharedSecret);
    }

    it('should preserve the original values in the encoding/decoding process', function (done) {
        var tokens = initTokens();
        var encodedToken = tokens.create(helper.productBaseUrl, helper.installedPayload.clientKey, USER_ID);
        tokens.verify(encodedToken, addon.config.maxTokenAge(),
                function (decodedToken) {
                    assert.equal(decodedToken.host, helper.productBaseUrl);
                    assert.equal(decodedToken.key, helper.installedPayload.clientKey);
                    assert.equal(decodedToken.user, USER_ID);
                    done();
                },
                function (err) {
                    assert.fail('Validation failed: ' + err.message);
                    done();
                }
        );
    });

    it('should fail on altered tokens', function (done) {
        var tokens = initTokens();
        var encodedToken = tokens.create(helper.productBaseUrl, helper.installedPayload.clientKey, USER_ID);
        var alteredToken = encodedToken + "A9";
        tokens.verify(alteredToken, addon.config.maxTokenAge(),
                function (decodedToken) {
                    assert.fail('Should have thrown an Invalid Signature error');
                    done();
                },
                function (err) {
                    assert.ok(err.message.indexOf('Invalid signature') > -1, 'Message should contain "Invalid signature": ' + err.message);
                    done();
                }
        );
    });

    it('should fail on expired tokens', function (done) {
        var tokens = initTokens();
        var encodedToken = tokens.create(helper.productBaseUrl, helper.installedPayload.clientKey, USER_ID);
        tokens.verify(encodedToken, -1000,
                function (decodedToken) {
                    assert.fail('Should have thrown a Token Expired error');
                    done();
                },
                function (err) {
                    assert.ok(err.message.indexOf('expired') > -1, 'Message should contain "expired": ' + err.message);
                    done();
                }
        );
    });

    it('should preserve the host, clientKey and user from the original signed request', function (done) {
        app.get(
                '/protected_resource1',
                addon.authenticate(),
                function (req, res) {
                    var token = res.locals.token;
                    res.send(token);
                }
        );
        var tokens = initTokens();

        var path = "/protected_resource1";
        var requestUrl = helper.addonBaseUrl + path;
        var requestOpts = {
            qs: {
                "xdm_e": helper.productBaseUrl,
                "jwt": createJwtToken({
                    // mock the request
                    method: 'get',
                    path: path,
                    query: {
                        "xdm_e": helper.productBaseUrl
                    }
                })
            },
            jar: false
        };

        request(requestUrl, requestOpts, function (err, res, body) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 200);
            tokens.verify(body, addon.config.maxTokenAge(),
                    function (verifiedToken) {
                        assert.equal(verifiedToken.host, helper.productBaseUrl);
                        assert.equal(verifiedToken.key, helper.installedPayload.clientKey);
                        assert.equal(verifiedToken.user, USER_ID);
                        done();
                    },
                    function (err) {
                        assert.fail('Token validation failed: ' + err.message);
                        done();
                    }
            );
        });
    });

    it('should allow requests with valid tokens', function (done) {
        app.get(
                '/protected_resource2',
                addon.checkValidToken(),
                function (req, res) {
                    res.send("success");
                }
        );
        var tokens = initTokens();
        var encodedToken = tokens.create(helper.productBaseUrl, helper.installedPayload.clientKey, USER_ID);

        var requestUrl = helper.addonBaseUrl + "/protected_resource2";
        var requestOpts = {
            qs: {
                "acpt": encodedToken
            },
            jar: false
        };

        request(requestUrl, requestOpts, function (err, res, body) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 200);
            assert.equal(body, "success");
            done();
        });
    });

    it('should reject requests with no token', function (done) {
        app.get(
                '/protected_resource3',
                addon.checkValidToken(),
                function (req, res) {
                    res.send("success");
                }
        );
        var requestUrl = helper.addonBaseUrl + "/protected_resource3";
        request(requestUrl, {jar: false}, function (err, res) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 401);
            done();
        });
    });

    it('should reject requests with invalid tokens', function (done) {
        app.get(
                '/protected_resource4',
                addon.checkValidToken(),
                function (req, res) {
                    res.send("success");
                }
        );
        var requestUrl = helper.addonBaseUrl + '/protected_resource4';
        var requestOpts = {
            qs: {
                "acpt": "An invalid token"
            },
            jar: false
        };
        request(requestUrl, requestOpts, function (err, res) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 401);
            done();
        });
    });

    it('should rehydrate response local variables from the token', function (done) {
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
        var encodedToken = tokens.create(helper.productBaseUrl, helper.installedPayload.clientKey, USER_ID);

        var requestUrl = helper.addonBaseUrl + '/protected_resource5';
        var requestOpts = {
            qs: {
                "acpt": encodedToken
            },
            jar: false
        };
        request(requestUrl, requestOpts, function (err, res, body) {
            var payload = JSON.parse(body);
            assert.equal(null, err);
            assert.equal(200, res.statusCode);
            assert.equal(payload.clientKey, helper.installedPayload.clientKey);
            assert.equal(payload.userId, USER_ID);
            assert.equal(payload.hostBaseUrl, helper.productBaseUrl);
            assert.equal(payload.hostStylesheetUrl, hostResourceUrl(app, helper.productBaseUrl, 'css'));
            assert.equal(payload.hostScriptUrl, hostResourceUrl(app, helper.productBaseUrl, 'js'));
            tokens.verify(payload.token, addon.config.maxTokenAge(),
                    function (decodedToken) {
                    },
                    function (err) {
                        assert.fail('Invalid token');
                    }
            );
            done();
        });
    });

    it('should not create tokens for requests without verified OAuth signatures', function (done) {
        app.get(
                '/protected_resource6',
                function (req, res) {
                    res.send(undefined === res.locals.token ? "no token" : res.locals.token);
                }
        );

        var requestUrl = helper.addonBaseUrl + '/protected_resource6';
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

    function initTokens() {
        return token(addon.config.privateKey(), addon.config.publicKey());
    }

    function hostResourceUrl(app, baseUrl, type) {
        var suffix = app.get('env') === 'development' ? '-debug' : '';
        return baseUrl + '/atlassian-connect/all' + suffix + '.' + type;
    }

});
