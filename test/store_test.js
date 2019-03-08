var helper = require('./test_helper');
var should = require('should');
var http = require('http');
var express = require('express');
var bodyParser = require('body-parser');
var request = require('request');
var RSVP = require('rsvp');
var Sequelize = require('sequelize');
var logger = require('./logger');
var sinon = require("sinon");
var MongodbMemoryServer = require('mongodb-memory-server').default;

var stores = ["sequelize", "mongodb"];

stores.forEach(function (store) {
    var app = express();
    var ac = require('../index');
    var addon = {};

    describe('Store ' + store, function () {
        var server = {}, dbServer = null;
        var oldACOpts = process.env.AC_OPTS;

        var storeGetSpy;
        var storeSetSpy;
        var storeDelSpy;

        before(function (done) {
            var self = this;
            this.sandbox = sinon.createSandbox();
            process.env.AC_OPTS = 'no-auth';
            app.set('env', 'development');
            app.use(bodyParser.urlencoded({extended: false}));
            app.use(bodyParser.json());

            app.get("/confluence/rest/plugins/1.0/", function (req, res) {
                res.setHeader("upm-token", "123");
                res.json({plugins: []});
                res.status(200).end();
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
                var Store = require("../lib/store/" + store)();
                storeGetSpy = self.sandbox.spy(Store.prototype, "get");
                storeSetSpy = self.sandbox.spy(Store.prototype, "set");
                storeDelSpy = self.sandbox.spy(Store.prototype, "del");
                return new Store(logger, opts);
            });

            var storeOptsPromise;
            switch (store) {
                case "sequelize":
                    storeOptsPromise = RSVP.resolve({
                        adapter: "teststore",
                        type: "memory"
                    });
                    break;
                case "mongodb":
                    // Increase timeout in case the download needs to be run.
                    this.timeout(60000);
                    // Prepare an in-memory database for this test
                    dbServer = new MongodbMemoryServer({
                        // debug: true // this is fairly verbose
                        binary: {
                            version: '3.6.9'
                        }
                    });
                    storeOptsPromise = dbServer.getConnectionString().then(function (connectionString) {
                        return {
                            adapter: "teststore",
                            url: connectionString
                        };
                    });
                    break;
            }
            storeOptsPromise.then(function (storeOpts) {
                addon = ac(app, {
                    config: {
                        development: {
                            store: storeOpts,
                            hosts: [helper.productBaseUrl]
                        }
                    }
                }, logger);

                server = http.createServer(app).listen(helper.addonPort, function () {
                    addon.register().then(done);
                });
            });
        });

        after(function (done) {
            this.sandbox.restore();
            process.env.AC_OPTS = oldACOpts;
            server.close();
            if (dbServer) {
                dbServer.stop();
            }
            done();
        });

        it('should store client info', function (done) {
            addon.on('host_settings_saved', function () {
                addon.settings.get('clientInfo', helper.installedPayload.clientKey).then(function (settings) {
                    settings.clientKey.should.eql(helper.installedPayload.clientKey);
                    settings.sharedSecret.should.eql(helper.installedPayload.sharedSecret);
                    done();
                }, function (err) {
                    should.fail(err.toString());
                });
            });
        });

        it('should return a list of clientInfo objects', function (done) {
            addon.settings.getAllClientInfos().then(function (initialClientInfos) {
                return addon.settings.set('clientInfo', {"correctPayload": true}, 'fake').then(function () {
                    return addon.settings.getAllClientInfos().then(function (clientInfos) {
                        clientInfos.should.have.length(initialClientInfos.length + 1);
                        var latestClientInfo = clientInfos[clientInfos.length - 1];
                        var correctPayload = latestClientInfo['correctPayload'];
                        correctPayload.should.be.true();
                        done();
                    });
                });
            }, function (err) {
                should.fail(err.toString());
            });
        });

        it('should allow storing arbitrary key/values as a JSON string', function (done) {
            var value = '{"someKey": "someValue"}';
            addon.settings.set('arbitrarySetting', value, helper.installedPayload.clientKey).then(function (setting) {
                setting.should.eql({someKey: "someValue"});
                done();
            }, function (err) {
                should.fail(err.toString());
            });
        });

        it('should allow storing arbitrary key/values as object', function (done) {
            addon.settings.set('arbitrarySetting2', {data: 1}, helper.installedPayload.clientKey).then(function (setting) {
                setting.should.eql({data: 1});
                done();
            }, function (err) {
                should.fail(err.toString());
            });
        });

        it('should allow storing arbitrary key/values', function (done) {
            var value = 'barf';
            addon.settings.set('arbitrarySetting3', value, helper.installedPayload.clientKey).then(function (setting) {
                setting.should.eql('barf');
                done();
            }, function (err) {
                should.fail(err.toString());
            });
        });

        switch (store) {
            case 'sequelize': {
                it('should allow storage of arbitrary models [' + store + ']', function (done) {
                    var User = addon.schema.define('User', {
                        id: {type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true},
                        name: {type: Sequelize.STRING},
                        email: {type: Sequelize.STRING},
                        bio: {type: Sequelize.JSON}
                    });

                    addon.schema.sync().then(function () {
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
                        }).then(function (model) {
                            model.name.should.eql("Rich");
                            User.findAll({name: "Rich"}).then(function (user) {
                                user[0].name.should.eql(model.name);
                                done();
                            });
                        })
                    }, function (err) {
                        should.fail(err.toString());
                    });
                });

                it('should work with a custom store', function (done) {
                    var promises = [
                        addon.settings.set('custom key', {customKey: 'custom value'}),
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
                break;
            }
            case 'mongodb': {
                it('should not allow storing a non-string key', function (done) {
                    var value = 'barf';
                    addon.settings.set(42, value, helper.installedPayload.clientKey).then(function () {
                        done(new Error('Expected non-string key storage to be disallowed'));
                    }).catch(function () {
                        done();
                    });
                });
                it('should not allow deleting a non-string key', function (done) {
                    var value = 'barf';
                    addon.settings.del(42, helper.installedPayload.clientKey).then(function () {
                        done(new Error('Expected non-string key deletion to be disallowed'));
                    }).catch(function () {
                        done();
                    });
                });
                it('should not allow storing a non-string clientKey', function (done) {
                    var value = 'barf';
                    addon.settings.set('additionalSetting4', value, 42).then(function () {
                        done(new Error('Expected non-string clientKey storage to be disallowed'));
                    }).catch(function () {
                        done();
                    });
                });
                it('should not allow deleting a non-string key', function (done) {
                    var value = 'barf';
                    addon.settings.del('additionalSetting4', 42).then(function () {
                        done(new Error('Expected non-string clientKey deletion to be disallowed'));
                    }).catch(function () {
                        done();
                    });
                });
                it('should allow an empty string key and value', function (done) {
                    addon.settings.set('', '', helper.installedPayload.clientKey).then(function (setting) {
                        should(setting).equal('');
                        return addon.settings.get('', helper.installedPayload.clientKey);
                    }).then(function (setting) {
                        should(setting).equal('');
                        done();
                    }).catch(done);
                });
                break;
            }
        }
    });
});