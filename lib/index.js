var EventEmitter = require('events').EventEmitter;
var URI = require('urijs');
var urls = require('url');
var _ = require('lodash');
var fs = require('fs');
var RSVP = require('rsvp');
var util = require('util');
var jwt = require('atlassian-jwt');
var config = require('./internal/config');
var utils = require('./internal/utils');
var registration = require('./internal/registration');
var defLogger = require('./internal/logger');
var HostRequest = require('./internal/host-request');
var verifyInstallation = require('./middleware/verify-installation');
var authentication = require('./middleware/authentication');
var token = require('./middleware/token');
var store = require('./store');
var jsonMinify = require("node-json-minify");

var DESCRIPTOR_FILENAME = 'atlassian-connect.json';
var CONFIG_FILENAME = 'config.json';

function Addon(app, opts, logger, callback) {

    RSVP.configure('onerror', function (err) {
        logger.error('Unhandled error:', err.stack || err);
    });

    var self = this;
    self.app = app;
    Addon.logger = self.logger = logger;

    var configOpts = utils.loadJSON(CONFIG_FILENAME);
    self.config = config(configOpts, app.get('env'), opts.config);
    Addon.settings = self.settings = store(logger, self.config.store());
    self.schema = self.settings.schema; // store-adapter-dependent
    self.descriptor = require('./internal/addon-descriptor')(self);
    self.key = self.descriptor.key;
    self.name = self.descriptor.name;

    // expose useful libs in addons
    self._ = _;
    self.RSVP = RSVP;
    self._jwt = jwt;

    try {
        _.extend(self, registration(self));
    } catch (e) {
        self.logger.info('Auto registration is not avaiable for this add-on.');
    }

    if (self.app.get('env') === 'development' && self.config.watch()) {
        self.logger.info('Watching ' + DESCRIPTOR_FILENAME + ' for changes');
        var reregisterWatcher = function () {
            self.watcher && self.watcher.close(); // clean up existing watcher if present
            self.watcher = fs.watch(DESCRIPTOR_FILENAME, {persistent: false}, function (event) {
                if (event === 'change' || event === 'rename') {
                    self.logger.info('Re-registering due to ' + DESCRIPTOR_FILENAME + ' change');
                    self.reloadDescriptor();
                    self.register(true);
                }
                // re-register after each change, intellij's "safe write" feature can break file watches
                reregisterWatcher();
            });
        };
        reregisterWatcher();
    }

    // defer configuration of the plugin until the express app has been configured
    process.nextTick(function () {
        self._configure(callback);
    });
}

var proto = Addon.prototype = Object.create(EventEmitter.prototype);

proto._configure = function (callback) {
    var self = this;

    fs.readFile(DESCRIPTOR_FILENAME, 'utf8', function(error, descriptorText) {
        if (error) {
            throw error;
        }

        var minified = jsonMinify(descriptorText);
        var rawDescriptorBaseUrl = JSON.parse(minified).baseUrl;

        if (!rawDescriptorBaseUrl) {
            throw Error('The "baseUrl" in ' + DESCRIPTOR_FILENAME + ' must be present and non-empty.');
        }

        var baseUrlInternal = new URI(rawDescriptorBaseUrl.replace('{{localBaseUrl}}', self.config.localBaseUrl()));
        self.config.baseUrl = urls.parse(baseUrlInternal.toString());
        var descriptorUrl = baseUrlInternal.clone().segment(DESCRIPTOR_FILENAME);

        self.app.get(descriptorUrl.path(), function (req, res) {
            res.charset = 'UTF-8'; // avoid browsers and https://jsonformatter.curiousconcept.com/ saying "Invalid encoding, expecting UTF-8, UTF-16 or UTF-32."
            res.json(self.descriptor);
        });

        // auto-register routes for each webhook in the descriptor
        var modules = self.descriptor.modules;
        if (modules && modules.webhooks) {
            var webhooks = modules.webhooks;
            if (!Array.isArray(webhooks)) {
                webhooks = [webhooks];
            }
            webhooks.forEach(function (webhook) {
                if (!webhook.event) {
                    self.logger.warn("Webhook does not have event property: " + util.inspect(webhook));
                    return;
                }
                if (!webhook.url) {
                    self.logger.warn("Webhook does not have url property: " + util.inspect(webhook));
                    return;
                }
                var webhookUrl = baseUrlInternal.clone().segment(webhook.url);
                self.app.post(
                    // mount path
                    webhookUrl.path(),
                    // auth middleware
                    authentication.authenticateWebhook(self),
                    // request handler
                    function (req, res) {
                        try {
                            self.emit(webhook.event, webhook.event, req.body, req);
                            res.status(204).end();
                        } catch (ex) {
                            res.status(500).send(_.escape(ex));
                        }
                    });
            });
        }

        var installUrl = baseUrlInternal.clone().segment('/installed');

        self.app.post(
            // installed POST handler
                installUrl.path(),
            // installed middleware (checks that the install event is complete and originates from an authorised host)
            verifyInstallation(self),
            function (req, res) {
                var settings = req.body;
                self.settings.set('clientInfo', settings, settings.clientKey).then(function (data) {
                    if (self.app.get('env') !== 'production') {
                        self.logger.info("Saved tenant details for " + settings.clientKey + " to database\n" + util.inspect(data));
                    }
                    self.emit('host_settings_saved', settings.clientKey, data);
                    res.status(204).end();
                }, function (err) {
                    res.status(500).send(_.escape('Could not lookup stored client data for ' + settings.clientKey + ': ' + err));
                });
            });

        if (callback) {
            callback();
        }
    });
};

// this middleware should be called by the add-on setup (see the template)
proto.middleware = function () {
    return require('./middleware')(this);
};

proto.authenticate = function (skipQshVerification) {
    return authentication.authenticate(this, skipQshVerification);
};

proto.loadClientInfo = function (clientKey) {
    return new RSVP.Promise(function (resolve, reject) {
        Addon.settings.get('clientInfo', clientKey).then(function (d) {
            resolve(d);
        }, function (err) {
            reject(err);
        });
    });
};

proto.checkValidToken = function () {
  return token(this);
};

proto.reloadDescriptor = function() {
  this.descriptor = require('./internal/addon-descriptor')(this);
};

/**
 * addon.httpClient(expressRequest)
 * addon.httpClient({clientKey, userKey})
 *
 * @param reqOrOpts either an expressRequest object or options
 * @returns HostClient a httpClient
 */
proto.httpClient = function (reqOrOpts) {
    var ctx = reqOrOpts.context;
    if (ctx) {
        return ctx.http;
    }

    if (!reqOrOpts.clientKey) {
        throw new Error('Http client options must specify clientKey');
    }

    return new HostRequest(this, reqOrOpts, reqOrOpts.clientKey);
};

module.exports = function (app, opts, logger, callback) {
    return new Addon(app, opts || {}, logger || defLogger, callback);
};

module.exports.store = {
    register: store.register
};
