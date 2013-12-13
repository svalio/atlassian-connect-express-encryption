var EventEmitter = require('events').EventEmitter;
var urls = require('url');
var _ = require('underscore');
var fs = require('fs');
var http = require('request');
var RSVP = require('rsvp');
var config = require('./internal/config');
var registration = require('./internal/registration');
var defLogger = require('./internal/logger');
var hostRequest = require('./internal/host-request');
var verifyInstallation = require('./middleware/verify-installation');
var authentication = require('./middleware/authentication');
var token = require('./middleware/token');
var store = require('./store');

RSVP.configure('onerror', function (event) {
    console.log("event ", event);
    console.assert(false, event.detail);
});

function Addon(app, opts, logger) {
    var self = this;
    self.app = app;
    Addon.logger = self.logger = logger;
    self.config = config(app.get('env'), opts.config);
    // Eventually we won't need keys... so let's get rid of this
    // self._verifyKeys();
    Addon.settings = self.settings = store(logger, self.config.store());
    self.schema = self.settings.schema; // store-adapter-dependent
    self.descriptor = require('./internal/addon-descriptor')(self);
    self.key = self.descriptor.key;
    self.name = self.descriptor.name;

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
    if (!this.config.privateKey() || !this.config.publicKey()) {
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
    var webhooks = self.descriptor.modules.webhooks;
    if (webhooks) {
        webhooks.forEach(function (webhook) {
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
                    self.logger.info("Saved tenant details for " + settings.clientKey + " to database", require('util').inspect(data));
                    self.emit('host_settings_saved', settings.clientKey, data);
                    res.send(204);
                }, function (err) {
                    res.send(500, 'Could not lookup stored client data for ' + issuer + ': ' + err);
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
 * addon.httpClient({clientSettings, userId})
 *
 * @param reqOrOpts either an expressRequest object or options
 * @returns {*} Promise that resolves an httpClient
 */
proto.httpClient = function (reqOrOpts) {
    var ctx = reqOrOpts.context;
    if (ctx) {
        return ctx.http;
    }
    if (!reqOrOpts.clientSettings) {
        throw new Error('Http client options must specify clientSettings');
    }
    if (!reqOrOpts.userId) {
        throw new Error('Http client options must specify a userId');
    }

    return hostRequest(this, reqOrOpts, reqOrOpts.clientSettings);
};

module.exports = function (app, opts, logger) {
    return new Addon(app, opts || {}, logger || defLogger);
};

module.exports.store = {
    register: store.register
};
