var request = require('request');
var URI = require('urijs');
var _ = require('lodash');
var RSVP = require('rsvp');
var ngrok = require('ngrok');
var hostInfo = require('./host-info');
var errmsg = require('./errors').errmsg;

function createTunnel(addon) {
    return new RSVP.Promise(function (resolve, reject) {
        var nonLocalHosts = [];
        if (process.env.AC_LOCAL_BASE_URL) {
            resolve();
        } else {
            nonLocalHosts = _.filter(addon.config.hosts(), function (host) {
                return !/localhost/.test(host);
            });
        }
        if (nonLocalHosts.length > 0) {
            ngrok.connect(addon.config.port(), function(err, url) {
                if(err) {
                    addon.logger.error('Failed to establish local tunnel');
                    reject(err && err.stack ? err : new Error(err));
                    return;
                }

                var ltu = new URI(url);
                var lbu = new URI(addon.config.localBaseUrl());
                lbu.protocol(ltu.protocol());
                lbu.host(ltu.host());
                process.env.AC_LOCAL_BASE_URL = lbu.toString();
                addon.logger.info('Local tunnel established at ' + lbu.toString());
                addon.logger.info('Check http://127.0.0.1:4040 for tunnel status');
                addon.emit('localtunnel_started');
                addon.reloadDescriptor();
                resolve();
            });
        } else {
            resolve();
        }
    });
}

exports.shouldRegister = function() {
    return /force-reg/.test(process.env.AC_OPTS) || this.settings.isMemoryStore();
};

exports.shouldDeregister = function() {
    return /force-dereg/.test(process.env.AC_OPTS) || this.settings.isMemoryStore() || this.config.environment() === 'development' ;
};

exports.register = function (isReregistration) {
    var self = this;
    return new RSVP.Promise(function (resolve, reject) {
        if (/no-reg/.test(process.env.AC_OPTS)) {
            self.logger.warn('Auto-registration disabled with AC_OPTS=no-reg');
            return resolve();
        }
        self._registrations = {};
        var hostRegUrls = self.config.hosts();
        createTunnel(self).then(
                function () {
                    if (hostRegUrls && hostRegUrls.length > 0) {
                        if (!isReregistration) {
                            self.logger.info('Registering add-on...');
                            process.once('SIGINT', function () {
                                console.log();
                                function sigint() {
                                    process.kill(process.pid, 'SIGINT');
                                }

                                self.deregister()
                                        .then(
                                        function () {
                                            self.emit('addon_deregistered');
                                            sigint();
                                        },
                                        function () {
                                            self.logger.error.apply(self.logger, arguments);
                                            sigint();
                                        }
                                );
                            });
                        }
                        var forceRegistration = self.shouldRegister() || isReregistration;
                        RSVP.all(hostRegUrls.map(_.bind(register, self, forceRegistration))).then(
                                function () {
                                    var count = _.keys(self._registrations).length;
                                    if (count === 0) {
                                        self.logger.warn('Add-on not registered; no compatible hosts detected');
                                    }
                                    resolve();
                                    self.emit('addon_registered');
                                }
                        );
                    }
                },
                function (err) {
                    console.log("err = " + err);
                    self.logger.error(errmsg(err));
                    reject(err);
                }
        );
    });
};

exports.deregister = function () {
    var self = this;
    var hostRegUrls = _.keys(self._registrations);
    var promise;
    if (hostRegUrls.length > 0 && self.shouldDeregister()) {
        self.logger.info('Deregistering add-on...');
        promise = RSVP.all(hostRegUrls.map(_.bind(deregister, self)));
    }
    else {
        // will be just RSVP.resolve() in v2.x
        promise = new RSVP.Promise(function (resolve) {
            resolve();
        });
    }
    promise.finally(function() {
        ngrok.disconnect(process.env.AC_LOCAL_BASE_URL);
    });
    return promise;
};

function register(forceRegistration, hostRegUrl) {
    var self = this;

    var localUrl = new URI(self.config.localBaseUrl());
    localUrl.segment('atlassian-connect.json');
    var descriptorUrl = localUrl.toString();
    descriptorUrl = descriptorUrl.replace("//v2", '/');
    return new RSVP.Promise(function (resolve, reject) {
        hostInfo.get({
            baseUrl: hostRegUrl,
            timeout: 5000
        }).then(
                function (info) {
                    var clientKey = info.key;

                    function done() {
                        var hostBaseUrl = stripCredentials(hostRegUrl);
                        self.logger.info('Registered with host ' + clientKey + ' at ' + hostBaseUrl);
                        self._registrations[hostRegUrl] = clientKey;
                        resolve();
                    }

                    function fail(args) {
                        self.logger.error(registrationError('register', clientKey, args[0], args[1]));
                        reject();
                    }

                    registerUpm(hostRegUrl, descriptorUrl, self.descriptor.key, forceRegistration).then(done, fail);
                },
                function (err) {
                    var url = new URI(hostRegUrl);
                    self.logger.error("Could not contact host:", url.hostname());
                    reject(err);
                }
        );
    });
}

function checkUpmRegistered(hostRegUrl, pluginKey) {
    return new RSVP.Promise(function (resolve, reject) {
        request.get({
            uri: hostRegUrl + '/rest/plugins/1.0/',
            jar: false
        }, function(err, res, body) {
            if (err || (res && (res.statusCode < 200 || res.statusCode > 299))) {
                return reject(err);
            }
            body = JSON.parse(body);
            if (body && body.plugins) {
                resolve(_.some(body.plugins, function(plugin) {
                    return plugin.key == pluginKey;
                }));
            }
        });
    });
    
}

function registerUpm(hostRegUrl, descriptorUrl, pluginKey, forceRegistration) {
    return new RSVP.Promise(function (resolve, reject) {
        request.head({
            uri: hostRegUrl + '/rest/plugins/1.0/',
            jar: false
        }, function (err, res) {
            if (err || (res && (res.statusCode < 200 || res.statusCode > 299))) {
                return reject([err, res]);
            }

            function doReg() {
                var upmToken = res.headers['upm-token'];
                request.post({
                    uri: hostRegUrl + '/rest/plugins/1.0/?token=' + upmToken,
                    headers: {'content-type': 'application/vnd.atl.plugins.remote.install+json'},
                    body: JSON.stringify({pluginUri: descriptorUrl}),
                    jar: false
                }, function (err, res) {
                    if (err || (res && res.statusCode !== 202)) {
                        return reject([err, res]);
                    }
                    var body = JSON.parse(res.body);
                    waitForRegistertrationResult(hostRegUrl, body).then(resolve, reject);
                });
            }

            if (forceRegistration) {
                doReg();
            } else {
                checkUpmRegistered(hostRegUrl, pluginKey).then(function(registered) {
                    if (registered) {
                        self.logger.info("Add-on " + pluginKey + "is already installed on " + stripCredentials(hostRegUrl));
                        resolve();
                        return;
                    }
                    doReg();
                }).catch(reject);
            }
        });

    });
}

function waitForRegistertrationResult(hostRegUrl, body) {
    var startTime = Date.now();
    var timeout = 10000;  // 10 Second Timeout

    var url = new URI(hostRegUrl).segment(body.links.self).toString();

    var callForRegistrationResult = function(lastBody) {
        var waitTime = lastBody.pingAfter || 200;
        return new RSVP.Promise(function(resolve, reject) {
            if (Date.now() - startTime > timeout) {
                reject(["Add-on installation timed out"]);
                return;
            }
            setTimeout(function(){
                request.get({
                    uri: url
                }, function(err, res) {
                    if (err || (res && (res.statusCode < 200 || res.statusCode > 299))) {
                        return reject([err, res]);
                    }
                    var results = JSON.parse(res.body);
                    // UPM installed payload changes on successful install
                    if (results.status && results.status.done) {
                        // if results.status.done is true, then the build has failed as the payload of a
                        // successful install does not contain the status object
                        reject([results.status.errorMessage, res]);
                    } else if (results.key) {
                        // Key will only exist if the install succeeds
                        if (!results.enabled) {
                            // If the add-on was disabled before being installed, it will go back to being disabled
                            self.logger.warn("Add-on is disabled on " + stripCredentials(hostRegUrl) + ". Enable manually via upm");
                        }
                        resolve();
                    } else {
                        // Still waiting on the finished event. Kinda hoping that this doesnt cause infinite looping if the payload changes :/
                        callForRegistrationResult(results).then(resolve, reject);
                    }
                });
            }, waitTime);
        });
    };
    return callForRegistrationResult(body);
}

function deregister(hostRegUrl) {
    var self = this;
    var clientKey = self._registrations[hostRegUrl];
    return new RSVP.Promise(function (resolve, reject) {
        function done() {
            var hostBaseUrl = stripCredentials(hostRegUrl);
            self.logger.info('Unregistered on host ' + clientKey + ' at ' + hostBaseUrl);
            self.settings.del(clientKey).then(
                    function () {
                        resolve();
                    },
                    function (err) {
                        self.logger.error(errmsg(err));
                        resolve();
                    }
            );
        }

        function fail(args) {
            self.logger.error(registrationError('deregister', clientKey, args[0], args[1]));
            resolve();
        }

        if (clientKey) {
            deregisterUpm(self, hostRegUrl, clientKey).then(done, fail);
        }
        else {
            resolve();
        }
    });
}

function deregisterUpm(self, hostRegUrl, clientKey) {
    return new RSVP.Promise(function (resolve, reject) {
        request.del({
            uri: hostRegUrl + '/rest/plugins/1.0/' + self.key + '-key',
            jar: false
        }, function (err, res) {
            if (err || (res && (res.statusCode < 200 || res.statusCode > 299))) {
                return reject([err, res]);
            }
            resolve();
        });
    });
}

function registrationError(action, clientKey, err, res) {
    var args = ['Failed to ' + action + ' with host ' + clientKey];
    if (res && res.statusCode) {
        args[0] = args[0] + (' (' + res.statusCode + ')');
    }
    if (err) {
        if (typeof err === 'string') {
            args.push(err);
        } else {
            args.push(errmsg(err));
        }
    }
    if (res && res.body && !/^<[^h]*html[^>]*>/i.test(res.body)) {
        args.push(res.body);
    }
    return args.join('\n');
}

function stripCredentials(url) {
    url = new URI(url);
    url.username('');
    url.password('');
    return url.toString();
}
