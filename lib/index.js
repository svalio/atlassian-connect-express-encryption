var EventEmitter = require("events").EventEmitter;
var urls = require("url");
var _ = require("underscore");
var fs = require("fs");
var config = require("./internal/config");
var registration = require("./internal/registration");
var defLogger = require("./internal/logger");
var oauth = require("./middleware/oauth");
var webhookOAuth = require("./middleware/webhook-oauth");

function Plugin(app, logger) {
  var self = this;
  self.app = app;
  self.logger = logger;
  self.config = config(app.get("env"));
  self._verifyKeys();
  self.settings = require("./store")(logger, self.config);
  self.descriptor = require("./internal/descriptor").load(self);
  self.key = self.descriptor.get("key");
  self.name = self.descriptor.get("name");

  _.extend(self, registration);

  self.on("remote_plugin_installed", function (key, settings) {
    self.settings.hset(settings.clientKey, settings);
  });

  if (self.app.get("env") === "development") {
    self.logger.info("Watching atlassian-plugin.xml for changes.");
    fs.watchFile("atlassian-plugin.xml", function (curr, prev) {
      if (curr.mtime > prev.mtime) {
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

var proto = Plugin.prototype = Object.create(EventEmitter.prototype);

proto._verifyKeys = function () {
  if (!this.config.privateKey() || !this.config.publicKey()) {
    throw new Error("Please run 'ap3 keygen' to generate this app's RSA key pair.");
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
          self.emit(webhook.get("event"), webhook.get("key"), req.body);
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

proto.httpClient = function (req) {
  return req.context && req.context.http;
};

module.exports = function (app, logger) {
  return new Plugin(app, logger || defLogger);
};
