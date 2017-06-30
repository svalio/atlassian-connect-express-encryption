var request = require('request');
var URI = require('urijs');
var _ = require('lodash');
var RSVP = require('rsvp');
var ngrok = require('ngrok');
var errmsg = require('../errors').errmsg;

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
                            
                            var handleKillSignal = function (signal) {
                                process.once(signal, function () {
                                    console.log('\nReceived signal ' + signal);

                                    function forwardSignal() {
                                        process.kill(process.pid, signal);
                                    }

                                    self.deregister()
                                            .then(
                                            function () {
                                                self.emit('addon_deregistered');
                                                forwardSignal();
                                            },
                                            function () {
                                                self.logger.error.apply(self.logger, arguments);
                                                forwardSignal();
                                            }
                                    );
                                });
                            };

                            handleKillSignal('SIGTERM');
                            handleKillSignal('SIGINT');
                            // nodemon sends the SIGUSR2 signal
                            // see https://github.com/remy/nodemon#controlling-shutdown-of-your-script
                            handleKillSignal('SIGUSR2');
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
    } else {
        promise = new RSVP.resolve();
    }
    promise.finally(function() {
        ngrok.kill();
    });
    return promise;
};

function register(forceRegistration, hostRegUrl) {
    var self = this;

    var descriptorUrl = new URI(self.config.localBaseUrl()).segment('atlassian-connect.json').toString();
    return new RSVP.Promise(function (resolve, reject) {
        function done(maybeResult) {
            var hostBaseUrl = stripCredentials(hostRegUrl);
            self.logger.info('Registered with host at ' + hostBaseUrl);
            self._registrations[hostRegUrl] = true;
            if (maybeResult) {
                self.logger.info(maybeResult);
            }
            resolve();
        }

        function fail(args) {
            self.logger.warn(registrationError('register', hostRegUrl, args[0], args[1]));
            resolve();  // reject will cause RSVP error handler in index.js to blow up
                        // resolve is fine since it will not be adding the client key and not count this as an install
        }

        registerUpm(hostRegUrl, descriptorUrl, self.descriptor.key, forceRegistration).then(done, fail);
    });
}

function registerUpm(hostRegUrl, descriptorUrl, pluginKey, forceRegistration) {
    var reqObject = getUrlRequestObject(hostRegUrl, '/rest/plugins/1.0/');
    reqObject.jar = false;
    return new RSVP.Promise(function (resolve, reject) {
        request.get(reqObject,
            function (err, res, body) {
                function doReg() {
                    var upmToken = res.headers['upm-token'];
                    var reqObject = getUrlRequestObject(hostRegUrl, '/rest/plugins/1.0/', { token: upmToken });
                    reqObject.headers = {'content-type': 'application/vnd.atl.plugins.remote.install+json'};
                    reqObject.body = JSON.stringify({pluginUri: descriptorUrl});
                    reqObject.jar = false;
                    request.post(reqObject,
                        function (err, res) {
                            if (err || (res && res.statusCode !== 202)) {
                                return reject([err, res]);
                            }
                            var body = JSON.parse(res.body);
                            waitForRegistrationResult(hostRegUrl, body).then(resolve, reject);
                        }
                    );
                }
                if (err || (res && (res.statusCode < 200 || res.statusCode > 299))) {
                    return reject([err, res]);
                }
                if (forceRegistration) {
                    doReg();
                } else {
                    body = JSON.parse(body);
                    if (body && body.plugins) {
                        var registered = false;
                        body.plugins.forEach(function(plugin) {
                            if (plugin.key == pluginKey) {
                                resolve("Add-on " + pluginKey + " is already installed on " + stripCredentials(hostRegUrl));
                                registered = true;
                            }
                        });
                        if (!registered) {
                            doReg();
                        }
                    }
                }
            }
        );
    });
}

function waitForRegistrationResult(hostRegUrl, body) {
    var startTime = Date.now();
    var timeout = 30000;  // 30 Second Timeout

    var reqObject = getUrlRequestObject(hostRegUrl, body.links.self);
    var callForRegistrationResult = function(lastBody) {
        var waitTime = lastBody.pingAfter || 200;
        return new RSVP.Promise(function(resolve, reject) {
            if (Date.now() - startTime > timeout) {
                reject(["Add-on installation timed out"]);
                return;
            }
            setTimeout(function(){
                request.get(reqObject,
                    function(err, res) {
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
                            var returnString = "";
                            if (!results.enabled) {
                                // If the add-on was disabled before being installed, it will go back to being disabled
                                returnString = "Add-on is disabled on " + stripCredentials(hostRegUrl) + ". Enable manually via upm";
                            }
                            resolve(returnString);
                        } else {
                            // Still waiting on the finished event. Kinda hoping that this doesnt cause infinite looping if the payload changes :/
                            callForRegistrationResult(results).then(resolve, reject);
                        }
                    }
                );
            }, waitTime);
        });
    };
    return callForRegistrationResult(body);
}

function deregister(hostRegUrl) {
    var self = this;
    return new RSVP.Promise(function (resolve, reject) {
        
        function done() {
            var hostBaseUrl = stripCredentials(hostRegUrl);
            self.logger.info('Unregistered on host ' + hostBaseUrl);
            delete self._registrations[hostRegUrl];
            resolve();
        }

        function fail(args) {
            self.logger.warn(registrationError('deregister', hostRegUrl, args[0], args[1]));
            resolve();
        }

        if (self._registrations[hostRegUrl]) {
            deregisterUpm(self, hostRegUrl).then(done, fail);
        } else {
            resolve();
        }
    });
}

function deregisterUpm(self, hostRegUrl) {
    return new RSVP.Promise(function (resolve, reject) {
        var reqObject = getUrlRequestObject(hostRegUrl, '/rest/plugins/1.0/' + self.key + '-key');
        reqObject.jar = false;
        request.del(reqObject, 
            function (err, res) {
            if (err || (res && (res.statusCode < 200 || res.statusCode > 299))) {
                return reject([err, res]);
            }
            resolve();
        });
    });
}

function registrationError(action, hostUrl, err, res) {
    var args = ['Failed to ' + action + ' with host ' + hostUrl];
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
    if (res && res.body && !/^\s*<[^h]*html[^>]*>/i.test(res.body)) {
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

function getUrlRequestObject(hostRegUrl, path, queryParams) {
    var uri = URI(hostRegUrl);
    var username = uri.username();
    var password = uri.password();
    uri.username('');
    uri.password('');
    // Remove any trailing slash from the uri
    // and any double product context from the path
    uri.pathname(uri.pathname().replace(/\/$/, '') +
        path.substring(path.indexOf('/rest/plugins/1.0')));
    if (queryParams) {
        uri.query(queryParams);
    }
    return {
        uri: uri.toString(),
        auth: {
            user: username,
            pass: password
        }
    }
}
