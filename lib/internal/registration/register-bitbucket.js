var request = require('request');
var RSVP = require('rsvp');
var urls = require('url');
var _ = require('lodash');
var path = require('path');
var fs = require('fs');
var inquirer = require('inquirer');
var appDir = path.dirname(require.main.filename);

var credentialsFile = 'credentials.json';
var credentialsErrorMessage = 'Couldn\'t read bitbucket.username and bitbucket.password from ' + credentialsFile;
var credentials;

/*
 Bitbucket (de-)registration end-points:

    GET https://api.bitbucket.org/2.0/account/USERNAME/addons

    POST https://api.bitbucket.org/2.0/account/USERNAME/addons
        {url: "http://pow-location-3.herokuapp.com/descriptor.json"}

    DELETE https://api.bitbucket.org/2.0/account/USERNAME/addons/ID
 */

function readCredentials() {
    return new RSVP.Promise(function (resolve, reject) {
        if (!credentials) {
            try {
                credentials = JSON.parse(fs.readFileSync(appDir + '/' + credentialsFile, 'utf8'));
            } catch (e) {
                // fall through
            }
        }
        if (credentials && credentials.bitbucket && credentials.bitbucket.username && credentials.bitbucket.password) {
            resolve(credentials);
        } else {
            reject(credentialsErrorMessage);
        }
    });
}

function asRequestAuth(credentials) {
    return {
        'user': credentials.bitbucket.username,
        'pass': credentials.bitbucket.password
    };
}

function getRegisteredAddonId(addonKey) {
    return readCredentials().then(function (credentials) {
        return new RSVP.Promise(function (resolve, reject) {
            request.get({
                uri: 'https://api.bitbucket.org/2.0/account/' + credentials.bitbucket.username + '/addons',
                auth: asRequestAuth(credentials)
            }, function (error, response, body) {
                if (error) {
                    reject('Failed to list Bitbucket add-ons ' + error);
                } else if (response.statusCode < 200 || response.statusCode >= 300) {
                    reject('Failed to list Bitbucket add-ons ' + response.statusCode + ' ' + JSON.stringify(body));
                } else {
                    try {
                        var data = JSON.parse(body);
                        var registration = _.find(data.values, function (registered) {
                            return registered.key === addonKey;
                        });
                        if (registration) {
                            resolve(registration.id);
                        } else {
                            resolve(null);
                        }
                    } catch (e) {
                        reject('Bitbucket returned an unexpected response.\nIf you have 2FA enabled on your account you may need to install the add-on manually.');
                        return;
                    }
                }
            });
        });
    });
}

function deregisterAddon(addonId) {
    return readCredentials().then(function (credentials) {
        return new RSVP.Promise(function (resolve, reject) {
            request.del({
                uri: 'https://api.bitbucket.org/2.0/account/' + credentials.bitbucket.username + '/addons/' + addonId,
                auth: asRequestAuth(credentials)
            }, function (error, response, body) {
                if (error) {
                    reject('Failed to uninstall Bitbucket add-on ' + error);
                } else if (response.statusCode < 200 || response.statusCode >= 300) {
                    reject('Failed to uninstall Bitbucket add-on ' + response.statusCode + ' ' + JSON.stringify(body));
                } else {
                    regsitered = false;
                    resolve();
                }
            });
        });
    });
}

function registerAddon(descriptorUrl) {
    return readCredentials().then(function (credentials) {
        return new RSVP.Promise(function (resolve, reject) {
            request.post({
                uri: 'https://api.bitbucket.org/2.0/account/' + credentials.bitbucket.username + '/addons',
                auth: asRequestAuth(credentials),
                json: true,
                body: { url: descriptorUrl }
            }, function (error, response, body) {
                if (error) {
                    reject('Failed to install Bitbucket add-on ' + error);
                } else if (response.statusCode < 200 || response.statusCode >= 300) {
                    reject('Failed to install Bitbucket add-on ' + response.statusCode + ' ' + JSON.stringify(body));
                } else {
                    resolve();
                }
            });
        });
    });
}

exports.deregister = function () {
    var self = this;

    return getRegisteredAddonId(self.descriptor.key).then(function (addonId) {
        return new RSVP.Promise(function (resolve, reject) {
            if (addonId) {
                resolve(deregisterAddon(addonId));
            } else {
                reject("No matching registered addon found.");
            }
        });
    });
};

var sigintSetup = false;

exports.register = function (isReregistration) {
    var self = this;

    if (isReregistration) {
        // deregister first
        return self.deregister().then(function () {
            self.register(false);
        });
    }

    // check if the add-on is already registered
    return getRegisteredAddonId(self.descriptor.key).then(function (addonId) {
        if (addonId) {
            return new RSVP.Promise(function (resolve, reject) {
                return inquirer.prompt({
                    type: 'confirm',
                    name: 'deregister',
                    message: 'An add-on with key ' + addonId + ' is already registered. Would you like to re-register it?',
                    default: false
                }).then(function (answer) {
                    if (answer.deregister) {
                        self.logger.info('Re-registering add-on.');
                        resolve(deregisterAddon(addonId));
                    } else {
                        reject('Add-on with this key was already registered.');
                    }
                });
            });
        }
    }).then(function () {
        var localUrl = urls.parse(self.config.localBaseUrl());
        localUrl.pathname = [localUrl.pathname, 'atlassian-connect.json'].join('');
        var descriptorUrl = urls.format(localUrl);

        return registerAddon(descriptorUrl)
            .then(function () {
                if (!sigintSetup) {
                    // trap SIGINT and deregister add-on
                    process.once('SIGINT', function () {
                        console.log('\nCaught SIGINT, deregistering add-on.');
                        function sigint() {
                            process.kill(process.pid, 'SIGINT');
                        }
                        self.deregister().then(function () {
                            self.emit('addon_deregistered');
                            sigint();
                        }, function () {
                            self.logger.error.apply(self.logger, arguments);
                            sigint();
                        });
                    });
                    sigintSetup = true;
                }
            });
    }).catch(function (error) {
        self.logger.error('Failed to register add-on: ' + error);
    });
};

exports.shouldRegister = function () {
    return /force-reg/.test(process.env.AC_OPTS) || this.settings.isMemoryStore();
};

exports.shouldDeregister = function () {
    return /force-dereg/.test(process.env.AC_OPTS) || this.settings.isMemoryStore();
};