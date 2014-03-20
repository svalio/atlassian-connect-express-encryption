var EventEmitter = require('events').EventEmitter;
var urls = require('url');
var _ = require('lodash');
var fs = require('fs');
var RSVP = require('rsvp');
var util = require('util');
var jwt = require('./internal/jwt');
var config = require('./internal/config');
var registration = require('./internal/registration');
var defLogger = require('./internal/logger');
var hostRequest = require('./internal/host-request');
var verifyInstallation = require('./middleware/verify-installation');
var authentication = require('./middleware/authentication');
var token = require('./middleware/token');
var store = require('./store');

function Addon(app, opts, logger) {

    RSVP.configure('onerror', function (err) {
        logger.error('Unhandled error:', err.stack || err);
    });

    var self = this;
    self.app = app;
    Addon.logger = self.logger = logger;
    self.config = config(app.get('env'), opts.config);
    // Eventually we won't need keys... so let's get rid of this
    self._verifyKeys();
    Addon.settings = self.settings = store(logger, self.config.store());
    self.schema = self.settings.schema; // store-adapter-dependent
    self.descriptor = require('./internal/addon-descriptor')(self);
    self.key = self.descriptor.key;
    self.name = self.descriptor.name;

    // expose useful libs in addons
    self._ = _;
    self.RSVP = RSVP;
    self._jwt = jwt;

    _.extend(self, registration);

    if (self.app.get('env') === 'development' && self.config.watch()) {
        self.logger.info('Watching atlassian-connect.json for changes');
        self.watcher = fs.watch('atlassian-connect.json', {persistent: false}, function (event, filename) {
            if (event === 'change') {
                self.logger.info('Re-registering due to atlassian-connect.json change');
                self.register(true);
            }
        });
    }

    // defer configuration of the plugin until the express app has been configured
    process.nextTick(function () {
        self._configure();
    });
}

var proto = Addon.prototype = Object.create(EventEmitter.prototype);

proto._verifyKeys = function () {
    if ((!this.config.privateKey() || !this.config.publicKey()) && this.config.usePublicKey()) {
        throw new Error('Please run \'atlas-connect keygen\' to generate this app\'s RSA key pair');
    }
};

proto._configure = function () {
    var self = this;
    var baseUrl = urls.parse(self.config.localBaseUrl());
    var basePath = baseUrl.path && baseUrl.path.length > 1 ? baseUrl.path : '';

    self.app.get(basePath + '/atlassian-connect.json', function (req, res) {
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
            var webhookUrl = basePath + webhook.url;
            self.app.post(
                    // mount path
                    webhookUrl,
                    // auth middleware
                    authentication.authenticateWebhook(self),
                    // request handler
                    function (req, res) {
                        try {
                            self.emit(webhook.event, webhook.event, req.body, req);
                            res.send(204);
                        } catch (ex) {
                            res.send(500, ex);
                        }
                    });
        });
    }

    self.app.post(
            // installed POST handler
            basePath + '/installed',
            // installed middleware (checks that the install event is complete and originates from an authorised host)
            verifyInstallation(self),
            function (req, res) {
                var settings = req.body;
                self.settings.set('clientInfo', settings, settings.clientKey).then(function (data) {
                    self.logger.info("Saved tenant details for " + settings.clientKey + " to database\n" + util.inspect(data));
                    self.emit('host_settings_saved', settings.clientKey, data);
                    res.send(204);
                }, function (err) {
                    res.send(500, 'Could not lookup stored client data for ' + settings.clientKey + ': ' + err);
                });
            });
};

proto.middleware = function () {
    return require('./middleware')(this);
};

proto.authenticate = function () {
    return authentication.authenticate(this);
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

/**
 * addon.httpClient(expressRequest)
 * addon.httpClient({clientKey, userKey})
 *
 * @param reqOrOpts either an expressRequest object or options
 * @returns {*} Promise that resolves an httpClient
 */
proto.httpClient = function (reqOrOpts) {
    var ctx = reqOrOpts.context;
    if (ctx) {
        return ctx.http;
    }

    // copy any values over from the session, if present
    if (reqOrOpts.session) {
        reqOrOpts = _.extend({}, reqOrOpts.session, reqOrOpts);
    }

    if (!reqOrOpts.clientKey) {
        throw new Error('Http client options must specify clientKey');
    }

    try {
        return hostRequest(this, reqOrOpts, reqOrOpts.clientKey);
    }
    catch (err) {
        this.logger.error('Caught error inside hostRequest():\n' + err.stack);
        throw err;
    }
};

module.exports = function (app, opts, logger) {
    return new Addon(app, opts || {}, logger || defLogger);
};

module.exports.store = {
    register: store.register
};
