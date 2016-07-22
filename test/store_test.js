var helper = require('./test_helper');
var should = require('should');
var http = require('http');
var express = require('express');
var bodyParser = require('body-parser');
var app = express();
var ac = require('../index');
var request = require('request');
var RSVP = require('rsvp');
var Schema = require('jugglingdb').Schema;
var logger = require('./logger');
var spy = require("sinon").spy;
var addon = {};

describe('Store', function () {
    var server = {};
    var oldACOpts = process.env.AC_OPTS;

    var storeGetSpy;
    var storeSetSpy;
    var storeDelSpy;

    before(function (done) {
        process.env.AC_OPTS = 'no-auth';
        app.set('env', 'development');
        app.use(bodyParser.urlencoded({extended: false}));
        app.use(bodyParser.json());

        // Head request to UPM installer
        app.head(/rest/, function (req, res) {
            res.status(200).end();
        });

        app.get("/confluence/rest/plugins/1.0/", function(req, res) {
            res.json({plugins: []});
        });

        // Post request to UPM installer
        app.post("/confluence/rest/plugins/1.0/", function (req, res) {
            request({
                url: helper.addonBaseUrl + '/installed',
                method: 'POST',
                json: helper.installedPayload
            });
            res.status(200).end();
        });

        ac.store.register("teststore", function (logger, opts) {
            var JugglingDB = require("../lib/store/jugglingdb")();
            storeGetSpy = spy(JugglingDB.prototype, "get");
            storeSetSpy = spy(JugglingDB.prototype, "set");
            storeDelSpy = spy(JugglingDB.prototype, "del");
            return new JugglingDB(logger, opts);
        });

        addon = ac(app, {
            config: {
                development: {
                    store: {
                        adapter: "teststore",
                        type: "memory"
                    },
                    hosts: [ helper.productBaseUrl ]
                }
            }
        }, logger);

        server = http.createServer(app).listen(helper.addonPort, function () {
            addon.register().then(done);
        });
    });

    after(function (done) {
        process.env.AC_OPTS = oldACOpts;
        server.close();
        done();
    });

    it('should store client info', function (done) {
        addon.on('host_settings_saved', function (clientKey, settings) {
            addon.settings.get('clientInfo', helper.installedPayload.clientKey).then(function (settings) {
                settings.clientKey.should.eql(helper.installedPayload.clientKey);
                settings.sharedSecret.should.eql(helper.installedPayload.sharedSecret);
                done();
            });
        });
    });

    it('should return a list of clientInfo objects', function (done) {
        addon.settings.getAllClientInfos().then(function (initialClientInfos) {
            addon.settings.set('clientInfo', '{"correctPayload":true}', 'fake').then(function() {
                addon.settings.getAllClientInfos().then(function (clientInfos) {
                    clientInfos.should.have.length(initialClientInfos.length + 1);
                    var latestClientInfo = clientInfos[clientInfos.length - 1];
                    var correctPayload = latestClientInfo['correctPayload'];
                    correctPayload.should.be.true();
                    done();
                });
            });
        });
    });

    it('should allow storing arbitrary key/values', function (done) {
        addon.settings.set('arbitrarySetting', 'someValue', helper.installedPayload.clientKey).then(function (setting) {
            setting.should.eql('someValue');
            done();
        })
    });

    it('should allow storing arbitrary key/values as JSON', function (done) {
        addon.settings.set('arbitrarySetting2', {data: 1}, helper.installedPayload.clientKey).then(function (setting) {
            setting.should.eql({data: 1});
            done();
        })
    });

    it('should allow storage of arbitrary models', function (done) {
        addon.schema.extend('User', {
            name: String,
            email: String,
            bio: Schema.JSON
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
                    }, function (err, model) {
                        model.name.should.eql("Rich");
                        User.all({ name: "Rich" }, function (err, user) {
                            user[0].name.should.eql(model.name);
                            done();
                        });
                    });
                },
                function (err) {
                    should.fail(err.toString());
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
            storeSetSpy.callCount.should.be.above(0);
            storeGetSpy.callCount.should.be.above(0);
            storeDelSpy.callCount.should.be.above(0);
            done();
        }, function (err) {
            should.fail(err);
        });
    });

});