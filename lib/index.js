var request = require("request");
var EventEmitter = require("events").EventEmitter;
var oauth = require("./middleware/oauth");
var urls = require("url");
var webhooks = require('./webhooks');
var registration = require('./registration');

function Plugin(app) {
  // @todo make this more robust
  this.app = app;
  this.settings = require("./internal/store");
  this.on("remote_plugin_installed", function (key, settings) {
    this.settings.hset(settings.clientKey, settings);
  });
}

var proto = Plugin.prototype = Object.create(EventEmitter.prototype);

proto.middleware = function () {
  return require("./middleware")(this);
}

proto.authenticate = oauth;

proto.configure = function (app) {

  var self = this;

  var appUrl = "http://rmanalang.local:" + app.get("port");
  self.descriptor = require("./internal/descriptor").load(appUrl);
  self.key = self.descriptor.get("key");

  app.get("/atlassian-plugin.xml", function (req, res) {
    res.send(self.descriptor.toString());
  });

  var installed = this.descriptor.webhooks("remote_plugin_installed")[0];

  // auto-register routes for each webhook in the descriptor
  this.descriptor.webhooks().forEach(function (webhook) {
    app.post(
      // mount path
      webhook.get("url"),
      // auth middleware
      function (req, res, next) {
        var path = urls.parse(req.url).pathname;
        if (installed && path === installed.get("url") && req.body.publicKey) {
          req.clientPublicKey = req.body.publicKey;
        }
        self.authenticate(app, self)(req, res, next);
      },
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

  webhooks(app, self);
};

// TODO clean up .register
proto.register = function (plugin) {
  registration.register(plugin);
};

proto._register = function (options) {
  console.log("Registering plugin...");
  request.post({
    uri: options.hostBaseUrl + "/rest/remotable-plugins/latest/installer",
    form: {url: options.localBaseUrl + "/atlassian-plugin.xml"},
    jar: false,
    auth: {
      user: options.user,
      pass: options.pass
    }
  }, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      if (options.error) options.error(err, body);
    }
    else {
      if (options.success) options.success();
    }
  });
};

proto.deregister = function (options) {
  request.del({
    uri: options.hostBaseUrl + "/rest/remotable-plugins/latest/uninstaller/" + this.key,
    jar: false,
    auth: {
      user: options.user,
      pass: options.pass
    }
  }, function (err, res, body) {
    if (err || res.statusCode !== 204) {
      if (options.error) options.error(err, body);
    }
    else {
      if (options.success) options.success();
    }
  });
};

module.exports = function (app) {
  return new Plugin(app);
}
