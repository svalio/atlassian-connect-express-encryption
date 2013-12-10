var EventEmitter = require('events').EventEmitter;
var urls = require('url');
var _ = require('underscore');
var fs = require('fs');
var http = require('request');
var RSVP = require('rsvp');
var jwt = require('jwt-simple');
var config = require('./internal/config');
var registration = require('./internal/registration');
var defLogger = require('./internal/logger');
var hostRequest = require('./internal/host-request');
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

    self.on('plugin_enabled', function (key, settings) {
        self.settings.set('clientInfo', settings, settings.clientKey).then(function (data) {
            self.emit('host_settings_saved', settings.clientKey, data);
        });
    });

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
};

proto.middleware = function () {
    return require('./middleware')(this);
};

proto.authenticate = function (publicKey) {
    throw new Error('NIH');
//    return oauth(this, publicKey);
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

proto.verifyRequest = function (req, res, next) {
    var self = this;

    function send(code, msg) {
        Addon.logger.error('JWT verification error:', code, msg);
        res.send(code, msg);
    }

    var jwtPayload = req.query.jwt;
    if (jwtPayload) {
        try {
            // First get the issuer from the JWT context by decoding it without verifying
            var clientId = jwt.decode(jwtPayload, null, true).iss;

            // Then, let's look up the client's oauthSecret so we can verify the request
            self.loadClientInfo(clientId).then(function (clientInfo) {
                // verify the signed request
                if (clientInfo === null) {
                    send(400, "Request can't be verified without an OAuth secret");
                    return;
                }
                var request = jwt.decode(req.query.signed_request, clientInfo.oauthSecret);
                req.context = request.context;
                req.clientInfo = clientInfo;
                next();
            }, function (err) {
                send(400, err.message);
            });
        }
        catch (e) {
            send(400, e.message);
        }
    }
    else if (req.body.oauth_client_id) {
        Addon.settings.get('clientInfo', req.body.oauth_client_id).then(function (d) {
            try {
                req.clientInfo = d;
                req.context = req.body;
                next();
            }
            catch (e) {
                send(400, e.message);
            }
        });
    }
};

// addon.httpClient(expressRequest)
// addon.httpClient({hostBaseUrl, userId [, appKey]})
proto.httpClient = function (reqOrOpts) {
    var ctx = reqOrOpts.context;
    if (ctx) {
        return ctx.http;
    }
    var opts = reqOrOpts;
    if (!opts.hostBaseUrl) {
        throw new Error('Http client options must specify a hostBaseUrl');
    }
    if (!opts.userId) {
        throw new Error('Http client options must specify a userId');
    }
    opts = _.extend({appKey: this.key}, opts);
    return hostRequest(opts, this.config.privateKey());
};

module.exports = function (app, opts, logger) {
    return new Addon(app, opts || {}, logger || defLogger);
};

module.exports.store = {
    register: store.register
};
