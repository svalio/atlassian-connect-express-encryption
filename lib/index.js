var EventEmitter = require("events").EventEmitter;
var urls = require("url");
var _ = require("underscore");
var fs = require("fs");
var config = require("./internal/config");
var registration = require("./internal/registration");
var defLogger = require("./internal/logger");
var hostRequest = require("./internal/host-request");
var oauth = require("./middleware/oauth");
var webhookOAuth = require("./middleware/webhook-oauth");

function Addon(app, opts, logger) {
  var self = this;
  self.app = app;
  self.logger = logger;
  self.config = config(app.get("env"), opts.config);
  self._verifyKeys();
  self.settings = require("./store")(logger, self.config);
  self.schema = self.settings.schema;
  self.descriptor = require("./internal/descriptor").load(self);
  self.key = self.descriptor.get("key");
  self.name = self.descriptor.get("name");

  _.extend(self, registration);

  self.on("remote_plugin_installed", function (key, settings) {
    self.settings.set(settings.clientKey, settings).then(function(){
      self.emit("host_settings_saved", settings.clientKey, settings);
    });
  });

  if (self.app.get("env") === "development" && self.config.watch()) {
    self.logger.info("Watching atlassian-plugin.xml for changes.");
    self.watcher = fs.watch("atlassian-plugin.xml", {persistent: false}, function (event, filename) {
      if (event === "change") {
        self.logger.info("Re-registering due to atlassian-plugin.xml change.")
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
    throw new Error("Please run 'feebs keygen' to generate this app's RSA key pair.");
  }
};

proto._configure = function () {

  var self = this;
  var baseUrl = urls.parse(self.config.localBaseUrl());
  var basePath = baseUrl.path && baseUrl.path.length > 1 ? baseUrl.path : "";

  self.app.get(basePath + "/atlassian-plugin.xml", function (req, res) {
    res.type("xml");
    if(self.app.get("env") == "development"){
      res.send(require("./internal/descriptor").load(self).toString());
    } else {
      res.send(self.descriptor.toString());
    }
  });

  // auto-register routes for each webhook in the descriptor
  self.descriptor.webhooks().forEach(function (webhook) {
    var webhookUrl = basePath + webhook.get("url");
    self.app.post(
      // mount path
      webhookUrl,
      // auth middleware
      webhookOAuth(self, basePath),
      // request handler
      function (req, res) {
        try {
          self.emit(webhook.get("event"), webhook.get("key"), req.body, req);
          res.send(204);
        }
        catch (ex) {
          res.send(500, ex);
        }
      });
  });

};

proto.middleware = function () {
  return require("./middleware")(this);
};

proto.authenticate = function (publicKey) {
  return oauth(this, publicKey);
};

// addon.httpClient(expressRequest)
// addon.httpClient({hostBaseUrl, userId [, appKey]})
proto.httpClient = function (reqOrOpts) {
  var ctx = reqOrOpts.context;
  if (ctx) return ctx.http;
  var opts = reqOrOpts;
  if (!opts.hostBaseUrl) throw new Error("Http client options must specify a hostBaseUrl");
  if (!opts.userId) throw new Error("Http client options must specify a userId");
  opts = _.extend({appKey: this.key}, opts);
  return hostRequest(opts, this.config.privateKey());
};

module.exports = function (app, opts, logger) {
  return new Addon(app, opts || {}, logger || defLogger);
};
