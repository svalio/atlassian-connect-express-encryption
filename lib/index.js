var request = require("request");
var EventEmitter = require("events").EventEmitter;
var oauth = require("./middleware/oauth");
var urls = require("url");
var config = require("./internal/config");
var Q = require("q");
var _ = require("underscore");
var colors = require("colors");
var lt = require("localtunnel").client;
var fs = require("fs");

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
  self.on("remote_plugin_installed", function (key, settings) {
//    self.logger.warn("DEBUG: plugin installed:", key, JSON.stringify(settings));
    self.settings.hset(settings.clientKey, settings);
  });

  if(self.app.get("env") === "development") {
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

  var installed = self.descriptor.webhooks("remote_plugin_installed")[0];
  var installedUrl = installed && basePath + installed.get("url");

  // auto-register routes for each webhook in the descriptor
  self.descriptor.webhooks().forEach(function (webhook) {
    var webhookUrl = basePath + webhook.get("url");
    self.app.post(
      // mount path
      webhookUrl,
      // auth middleware
      function (req, res, next) {
        var path = urls.parse(req.url).pathname;
//        self.logger.warn("DEBUG: webhook auth:", JSON.stringify(installed), path, JSON.stringify(req.body));
        if (!installed || path !== installedUrl) {
//          self.logger.warn("DEBUG: Authenticating webhook", webhookUrl);
          self.authenticate()(req, res, next);
        }
        else {
          // @todo for the "installed" webhook, we need to handshake back with the host at a known or
          //       discovered url to retrieve its public key and verify the signature
          // @see https://bitbucket.org/atlassian/node-ap3/issue/9/in-production-mode-whitelist-only-jiracom
          // @see https://bitbucket.org/atlassian/node-ap3/issue/10/verify-host-during-remote_plugin_installed
//          self.logger.warn("DEBUG: Allowing webhook", webhookUrl);
          next();
        }
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

proto.middleware = function () {
  return require("./middleware")(this);
};

proto.authenticate = function () {
  return oauth(this);
};

// returns the best available http client given a context request
proto.httpClient = function (req) {
  return (req.context && req.context.http) || require("request");
};

proto.register = function (isReregistration) {
  var self = this;
  var hosts = this.config.hosts();
  if (hosts && hosts.length > 0) {
    self._registrations = {};
    if(!isReregistration){
      self.logger.info("Registering plugin...");
      process.once("SIGINT", function () {
        function exit() { process.exit(1); }
        self.deregister().then(exit, exit);
      });
    }
    return Q.allResolved(hosts.map(_.bind(register, self))).then(
      function (promises) {
        promises.forEach(function (promise) {
          var host = promise.valueOf();
          if (host) {
            self.once("remote_plugin_installed", function (key, settings) {
              if (stripCredentials(host) === settings.baseUrl) {
                self.logger.info("Registered with " + settings.baseUrl + ".");
                self._registrations[host] = settings.clientKey;
                // @todo unsubscribe this webhook listener
              }
            });
          }
        });
      },
      function () {
        self.logger.error.apply(self.logger, arguments);
      }
    );
  }
  return Q.resolve();
};

function register(host) {
  var self = this;
  var dfd = Q.defer();
  request.post({
    uri: host + "/rest/remotable-plugins/latest/installer",
    form: {url: self.config.localBaseUrl() + "/atlassian-plugin.xml"},
    jar: false
  }, function (err, res, body) {
    if ((err && err.code !== "ECONNREFUSED") || res && res.statusCode !== 200) {
      var args = ["Failed to register with host server:"];
      if (err) args.push(err);
      if (body) args.push(body);
      self.logger.error.apply(self.logger, args);
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
  if (self._registrations) {
    var hosts = _.keys(self._registrations);
    if (hosts && hosts.length > 0) {
      console.log();
      self.logger.info("Deregistering plugin...");
      return Q.allResolved(hosts.map(_.bind(deregister, self))).then(
        function (promises) {
          promises.forEach(function (promise) {
            var host = promise.valueOf();
            if (host) {
              // @todo is there an uninstall webhook we can listen for for parity with register?
              var bareHost = stripCredentials(host);
              delete self._registrations[bareHost];
              self.logger.info("Deregistered with host " + bareHost + ".");
            }
          });
        },
        function () {
          self.logger.error(arguments.join(' '))
        }
      );
    }
  }
  return Q.resolve();
};

function deregister(host) {
  var self = this;
  var dfd = Q.defer();
  request.del({
    uri: host + "/rest/remotable-plugins/latest/uninstaller/" + this.key,
    jar: false
  }, function (err, res) {
    if ((err && err.code !== "ECONNREFUSED") || res && res.statusCode !== 204) {
      var args = ["Failed to deregister with host server"];
      if (err) args.push(":" + err);
      self.logger.error.apply(self.logger, args);
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

function Logger() {
  var logger = {};
  var ops = {"info": "white", "warn": "yellow", "error": "red"};
  _.keys(ops).forEach(function (op) {
    logger[op] = function () {
      var args = [].slice.call(arguments);
      console[op].apply(console, args.map(function (arg) {
        // @todo stringify objects with util.inspect and then apply styles to the resulting string
        return _.isObject(arg) ? arg : new String(arg)[ops[op]].bold;
      }));
    };
  });
  return logger;
}

function stripCredentials(url) {
  url = urls.parse(url);
  delete url.auth;
  return urls.format(url);
}

module.exports = function (app, logger) {
  if (!logger) logger = Logger();
  return new Plugin(app, logger);
};
