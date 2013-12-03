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
var oauth = require('./middleware/oauth');
var webhookOAuth = require('./middleware/webhook-oauth');
var store = require('./store');

RSVP.configure('onerror', function(event) {
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
    self.settings.set('clientInfo', settings, settings.clientKey).then(function(data){
      self.emit('host_settings_saved', settings.clientKey, data);
    });
  });

  if (self.app.get('env') === 'development' && self.config.watch()) {
    self.logger.info('Watching atlassian-connect.json for changes');
    self.watcher = fs.watch('atlassian-connect.json', {persistent: false}, function (event, filename) {
      if (event === 'change') {
        self.logger.info('Re-registering due to atlassian-connect.json change')
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
  if (typeof self.descriptor.capabilities.webhooks != 'undefined') {
    self.descriptor.capabilities.webhooks.forEach(function (webhook) {
      var webhookUrl = basePath + webhook.url;
      self.app.post(
        // mount path
        webhookUrl,
        // auth middleware
        webhookOAuth(self, basePath),
        // request handler
        function (req, res) {
          try {
            self.emit(webhook.event, webhook.event, req.body, req);
            res.send(204);
          } catch (ex) {
            res.send(500, ex);
          }
        }
      );
    });
  }

  // HC Connect install verification flow
  var verifyInstallation = function(url){
    return new RSVP.Promise(function(resolve, reject){
      http.get(url, function(err, res, body){
        var data = JSON.parse(body);
        if(!err){
          if(data.links.self === url){
            resolve(data);
          } else {
            reject("The capabilities URL " + url + " doesn't match the resource's self link " + data.links.self);
          }
        } else {
          reject(err);
        }
      });
    });
  };

  // auto-register routes for HC installable in the descriptor
  if (typeof self.descriptor.capabilities.installable != 'undefined') {
    var callbackUrl = '/'+self.descriptor.capabilities.installable.callbackUrl.split('/').slice(3).join('/');

    // Install handler
    self.app.post(
      // mount path
      callbackUrl,
      // auth middleware
      // webhookOAuth(self, basePath),
      // request handler
      function (req, res) {
        try {
          verifyInstallation(req.body.capabilitiesUrl)
            .then(function(hcCapabilities){
              var clientInfo = {
                clientKey: req.body.oauthId,
                oauthSecret: req.body.oauthSecret,
                capabilitiesUrl: req.body.capabilitiesUrl,
                capabilitiesDoc: hcCapabilities
              };
              self.getAccessToken(clientInfo)
                .then(function(tokenObj){
                  clientInfo.groupId = tokenObj.group_id;
                  clientInfo.groupName = tokenObj.group_name;
                  self.emit('installed', clientInfo.clientKey, clientInfo);
                  self.emit('plugin_enabled', clientInfo.clientKey, clientInfo);
                  res.send(204);
                })
                .then(null, function(err){
                  res.send(500, err);
                });
            })
            .then(null, function(err){
              res.send(500, err);
            }
          );
        } catch (e) {
          res.send(500, e);
        }
      }
    );

    // Uninstall handler
    self.app.delete(
      callbackUrl + '/:oauthId',
      // verify request,
      function(req, res){
        try {
          self.emit('uninstalled', req.params.oauthId);
          res.send(204);
        } catch (e) {
          res.send(500, e);
        }
      }
    );
  }

};

proto.getAccessToken = function(clientInfo, scopes) {

  var self = this;
  function generateAccessToken(scopes){
    return new RSVP.Promise(function(resolve, reject){
      var tokenUrl = clientInfo.capabilitiesDoc.capabilities.oauth2Provider.tokenUrl;
      http.post(tokenUrl, {
        form: {
          'grant_type': 'client_credentials',
          'scope': scopes.join(' ')
        },
        auth: {
          user: clientInfo.clientKey,
          pass: clientInfo.oauthSecret
        }
      }, function(err, res, body){
        if(!err) {
          try {
            var token = JSON.parse(body);
            token.created = new Date().getTime() / 1000;
            resolve(token);
          } catch(e) {
            reject(e);
          }
        } else {
          reject(err);
        }
      });
    });
  }

  return new RSVP.Promise(function(resolve, reject){
    scopes = scopes || self.descriptor.capabilities.hipchatApiConsumer.scopes;
    var scopeKey = scopes.join("|");

    function generate() {
      generateAccessToken(scopes).then(
        function(token) {
          Addon.settings.set(scopeKey, token, clientInfo.clientKey);
          resolve(token);
        },
        function(err) {
          reject(err);
        }
      );
    }

    Addon.settings.get(scopeKey, clientInfo.clientKey).then(function(token){
      if (token) {

        if (token.expires_in + token.created < (new Date().getTime() / 1000)) {
          resolve(token);
        } else {
          generate();
        }
      } else {
        generate();
      }
    }, function(err) {
      reject(err);
    });
  });
};

proto.middleware = function () {
  return require('./middleware')(this);
};

proto.authenticate = function (publicKey) {
  return oauth(this, publicKey);
};

proto.loadClientInfo = function(clientKey) {
  return new RSVP.Promise(function(resolve, reject){
    Addon.settings.get('clientInfo', clientKey).then(function(d){
      resolve(d);
    }, function(err) {
      reject(err);
    });
  });
};

proto.verifyRequest = function(req, res, next) {
  var self = this;
  function send(code, msg) {
    Addon.logger.error('JWT verification error:', code, msg);
    res.send(code, msg);
  }

  if (req.query.signed_request) {
    try {
      // First get the oauthId from the JWT context by decoding it without verifying
      var clientId = jwt.decode(req.query.signed_request, null, true).iss;

      // Then, let's look up the client's oauthSecret so we can verify the request
      self.loadClientInfo(clientId).then(function(clientInfo){
        // verify the signed request
        if (clientInfo === null) {
          return send(400, "Request can't be verified without an OAuth secret");
        }
        var request = jwt.decode(req.query.signed_request, clientInfo.oauthSecret);
        req.context = request.context;
        req.clientInfo = clientInfo;
        next();
      }, function(err) {
        return send(400, err.message);
      });
    } catch(e){
      return send(400, e.message);
    }
  } else if (req.body.oauth_client_id) {
    Addon.settings.get('clientInfo', req.body.oauth_client_id).then(function(d){
      try {
        req.clientInfo = d;
        req.context = req.body;
        next();
      } catch(e){
        return send(400, e.message);
      }
    });
  }
};

// addon.httpClient(expressRequest)
// addon.httpClient({hostBaseUrl, userId [, appKey]})
proto.httpClient = function (reqOrOpts) {
  var ctx = reqOrOpts.context;
  if (ctx) return ctx.http;
  var opts = reqOrOpts;
  if (!opts.hostBaseUrl) throw new Error('Http client options must specify a hostBaseUrl');
  if (!opts.userId) throw new Error('Http client options must specify a userId');
  opts = _.extend({appKey: this.key}, opts);
  return hostRequest(opts, this.config.privateKey());
};

module.exports = function (app, opts, logger) {
  return new Addon(app, opts || {}, logger || defLogger);
};

module.exports.store = {
  register: store.register
};
