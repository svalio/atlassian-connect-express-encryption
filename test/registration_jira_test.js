var helper = require('./test_helper');
var assert = require('assert');
var http = require('http');
var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var ac = require('../index');
var request = require('request');
var jwt = require('atlassian-jwt');
var logger = require('./logger');
var moment = require("moment");
var addon = {};

describe('Auto registration (UPM)', function () {
    var server = {};
    var regPromise;

    before(function (done) {
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
            regPromise = addon.register().then(done);
        });
    });

    after(function (done) {
        server.close();
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

    function testIfEventCalled(spy, done) {
        return setTimeout(function () {
            assert(false, 'Event never fired');
            done();
        }, 1000);
    }

    function eventFired(timer, done, cb) {
        clearTimeout(timer);
        assert(true, "Event fired");
        if (cb) {
            cb(done);
        }
        else {
            done();
        }
    }

    it('event fired when addon.register() is called', function (done) {
        var timer = testIfEventCalled();
        regPromise.then(function () {
            eventFired(timer, done);
        });
    });

});
