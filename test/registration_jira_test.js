var helper = require('./test_helper');
var assert = require('assert');
var http = require('http');
var express = require('express');
var bodyParser = require('body-parser');
var ac = require('../index');
var request = require('request');
var jwt = require('atlassian-jwt');
var logger = require('./logger');
var moment = require('moment');
var sinon = require('sinon');
var RSVP = require('rsvp');
var requireOptional = require('../lib/internal/require-optional');

describe('Auto registration (UPM)', function () {
    var requireOptionalStub;
    var requestGetStub;
    var server;
    var app;
    var addon;

    beforeEach(function () {
        requireOptionalStub = sinon.stub(requireOptional, 'requireOptional');

        app = express();
        addon = {};

        app.set('env', 'development');
        app.use(bodyParser.urlencoded({extended: false}));
        app.use(bodyParser.json());

        app.get("/rest/plugins/1.0/", function (req, res) {
            res.setHeader("upm-token", "123");
            res.json({plugins: []});
            res.status(200).end();
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
            res.status(200).end();
        });

        app.delete(/plugins\/1.0\/(.*?)-key/, function (req, res) {
            res.status(200).end();
        });

        ac.store.register("teststore", function (logger, opts) {
            return require("../lib/store/sequelize")(logger, opts);
        });
    });

    afterEach(function (done) {
        delete process.env.AC_LOCAL_BASE_URL;
        requireOptionalStub.restore();
        if (requestGetStub) { requestGetStub.restore(); }
        if (server) { server.close(); }
        done();
    });

    function createJwtToken() {
        var jwtPayload = {
            "iss": helper.installedPayload.clientKey,
            "iat": moment().utc().unix(),
            "exp": moment().utc().add(10, 'minutes').unix()
        };

        return jwt.encode(jwtPayload, helper.installedPayload.sharedSecret);
    }

    function createAddon(hosts) {
        addon = ac(app, {
            config: {
                "development": {
                    store: {
                        adapter: 'teststore',
                        type: "memory"
                    },
                    hosts
                }
            }
        }, logger);
    }

    function startServer(cb) {
        server = http.createServer(app).listen(helper.addonPort, cb);
    }

    function stubInstalledPluginsResponse(key) {
        requestGetStub = sinon.stub(request, 'get');
        requestGetStub.callsArgWith(1, null, null, JSON.stringify({
            plugins: [{
                key: 'my-test-app-key'
            }]
        }));
    }

    function stubNgrokWorking() {
        requireOptionalStub.returns(RSVP.resolve({
            connect: function (port, cb) {
                cb(null, 'https://test.ngrok.io');
            }
        }));
    }

    function stubNgrokUnavailable() {
        const error = new Error("Cannot find module 'ngrok' (no worries, this error is thrown on purpose by stubNgrokUnavailable in test)");
        error.code = 'MODULE_NOT_FOUND';
        requireOptionalStub.returns(RSVP.reject(error));
    }

    it('registration works with local host and does not involve ngrok', function (done) {
        createAddon([helper.productBaseUrl]);
        startServer(function () {
            addon.register().then(function () {
                assert(requireOptionalStub.notCalled, "ngrok should not be called");
                done();
            }, done);
        });
    }).timeout(1000);

    it('registration works with remote host via ngrok', function (done) {
        stubNgrokWorking();
        stubInstalledPluginsResponse('my-test-app-key')

        createAddon(['http://admin:admin@example.atlassian.net/wiki']);

        addon.register().then(function () {
            assert(requireOptionalStub.called, 'ngrok should be called');
            done();
        });
    }).timeout(1000);

    it('registration fails with remote host when ngrok unavailable', function (done) {
        stubNgrokUnavailable();

        createAddon(['http://admin:admin@example.atlassian.net/wiki']);

        addon.register().then(
            function onSuccess() {
                done(new Error('Registration should have failed'));
            },
            function onError(err) {
                assert(err.code === 'MODULE_NOT_FOUND');
                done();
            });
    }).timeout(1000);
});
