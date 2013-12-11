var helper = require('./test_helper');
var assert = require('assert');
var http = require('http');
var express = require('express');
var app = express();
var ac = require('../index');
var request = require('request');
var sinon = require('sinon');
var logger = require('./logger');
var jwt = require('jwt-simple');
var addon = {};

describe('Webhook', function () {
    var server;
    var hostServer;

    before(function (done) {
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
        hostServer = http.createServer(host).listen(3002, function () {
            server = http.createServer(app).listen(port, function () {
                done();
            });
        });
    });

    after(function (done) {
        process.env.AC_OPTS = 'no-auth';
        server.close();
        hostServer.close();
        done();
    });

    function fireTestWebhook(route, body) {
        var url = 'http://localhost:3001' + route + '?user_id=admin';

        var secret = "s3cr3t";
        var jwtPayload = {
            "iss": "testHostClientKey",
            "iat": 0,
            "exp": 1
        };

        var token = jwt.encode(jwtPayload, secret);

        request.post(url, {
            jwt: token,
            jar: false,
            json: body
        }, function (err, res) {
            assert.equal(err, null);
            assert.equal(res.statusCode, 204, res.body);
        });
    }

    it('should fire an add-on event', function (done) {
        addon.once('plugin_test_hook', function (key, body, req) {
            assert(key === 'plugin_test_hook');
            assert(body != null && body.foo === 'bar');
            assert(req && req.param('user_id') === 'admin');
            done();
        });

        fireTestWebhook('/test-hook', {foo: 'bar'});
    });

    it('should perform special oauth verification for the enabled webhook', function (done) {
        var triggered = sinon.spy();
        addon.once('webhook_auth_verification_triggered', triggered);
        var successful = sinon.spy();
        addon.once('installed_auth_verification_successful', successful);

        addon.once('plugin_enabled', function (key, body, req) {
            assert(triggered.called);
            assert(successful.called);
            done();
        });

        fireTestWebhook('/enabled', helper.clientInfo);
    });

    it('should perform normal oauth verification for other webhooks', function (done) {
        var triggered = sinon.spy();
        addon.once('webhook_oauth_verification_triggered', triggered);
        var successful = sinon.spy();
        addon.once('other_webhook_oauth_verification_successful', successful);

        addon.once('plugin_test_hook', function (key, body, req) {
            assert(triggered.called);
            assert(successful.called);
            done();
        });

        fireTestWebhook('/test-hook', {foo: 'bar'});
    });

});
