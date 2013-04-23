var request = require("request");
var EventEmitter = require("events").EventEmitter;
var oauth = require("./middleware/oauth");
var urls = require("url");
var config = require("./internal/config");
var Q = require("q");
var _ = require("underscore");

function Plugin(app) {
  this.app = app;
  this.config = config(app.get("env"));
  this.settings = require("./store")(this.config);
  this.descriptor = require("./internal/descriptor").load(this);
  this.key = this.descriptor.get("key");
  this.name = this.descriptor.get("name");
  this.on("remote_plugin_installed", function (key, settings) {
    this.settings.hset(settings.clientKey, settings);
  });
}

var proto = Plugin.prototype = Object.create(EventEmitter.prototype);

proto.middleware = function () {
  return require("./middleware")(this);
}

proto.authenticate = function () {
  return oauth(this);
};

proto.configure = function () {

  var self = this;

  self.app.get("/atlassian-plugin.xml", function (req, res) {
    res.type("xml");
    res.send(self.descriptor.toString());
  });

  var installed = self.descriptor.webhooks("remote_plugin_installed")[0];

  // auto-register routes for each webhook in the descriptor
  self.descriptor.webhooks().forEach(function (webhook) {
    self.app.post(
      // mount path
      webhook.get("url"),
      // auth middleware
      function (req, res, next) {
        var path = urls.parse(req.url).pathname;
        if (installed && path === installed.get("url") && req.body.publicKey) {
          req.clientPublicKey = req.body.publicKey;
        }
        self.authenticate(self)(req, res, next);
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
};

proto.register = function () {
  var self = this;
  var hosts = this.config.hosts();
  if (hosts) {
    console.log("Registering plugin...");
    process.once("SIGINT", function () {
      function exit() { process.exit(1); }
      console.log();
      self.deregister().then(exit, exit);
    });
    return Q.allResolved(hosts.map(_.bind(register, self))).then(
      function (promises) {
        promises.forEach(function (promise) {
          var host = promise.valueOf();
          if (host) {
            self.on("remote_plugin_installed", function (key, settings) {
              if (host.url === settings.baseUrl) {
                console.log("Registered with " + host.url + ".");
                host.key = settings.clientKey;
                // @todo unsubscribe this webhook listener
              }
            });
          }
        });
      },
      function () {
        console.error.apply(console, arguments)
      }
    );
  }
  return Q.resolve();
};

function register(host) {
  var self = this;
  var dfd = Q.defer();
  request.post({
    uri: host.url + "/rest/remotable-plugins/latest/installer",
    form: {url: self.config.localBaseUrl() + "/atlassian-plugin.xml"},
    jar: false,
    auth: {
      user: host.user,
      pass: host.pass
    }
  }, function (err, res, body) {
    if ((err && err.code !== "ECONNREFUSED") || res && res.statusCode !== 200) {
      var args = ["Failed to register with host server:"];
      if (err) args.push(err);
      if (body) args.push(body);
      console.error.apply(console, args);
      dfd.resolve();
    }
    else if (res && res.statusCode === 200) {
      dfd.resolve(host);
    }
    else {
      dfd.resolve();
    }
  });
  return dfd.promise;
}

proto.deregister = function () {
  var self = this;
  var hosts = this.config.hosts();
  if (hosts) {
    console.log("Deregistering plugin...");
    return Q.allResolved(hosts.map(_.bind(deregister, self))).then(
      function (promises) {
        promises.forEach(function (promise) {
          var host = promise.valueOf();
          if (host) {
            // @todo is there an uninstall webhook we can listen for for parity with register?
            console.log("Deregistered with host " + host.url + ".");
          }
        });
      },
      function () {
        console.error.apply(console, arguments)
      }
    );
  }
  return Q.resolve();
};

function deregister(host) {
  var self = this;
  var dfd = Q.defer();
  request.del({
    uri: host.url + "/rest/remotable-plugins/latest/uninstaller/" + this.key,
    jar: false,
    auth: {
      user: host.user,
      pass: host.pass
    }
  }, function (err, res) {
    if ((err && err.code !== "ECONNREFUSED") || res && res.statusCode !== 204) {
      var args = ["Failed to deregister with host server"];
      if (err) args.push(":" + err);
      console.error.apply(console, args);
      dfd.resolve();
    }
    else if (res && res.statusCode === 204) {
      if (host.key) {
        function resolve() { dfd.resolve(host); }
        self.settings.hdel(host.key).then(resolve, resolve);
      }
      else {
        dfd.resolve(host);
      }
    }
    else {
      dfd.resolve();
    }
  });
  return dfd.promise;
}

module.exports = function (app) {
  return new Plugin(app);
};
