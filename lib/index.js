var request = require("request");
var EventEmitter = require("events").EventEmitter;
var oauth = require("./middleware/oauth");
var urls = require("url");
var config = require("./internal/config");
var Q = require("q");
var _ = require("underscore");
var colors = require("colors");

function Plugin(app, logger) {
  this.app = app;
  this.logger = logger;
  this.config = config(app.get("env"));
  this._verifyKeys();
  this.settings = require("./store")(logger, this.config);
  this.descriptor = require("./internal/descriptor").load(this);
  this.key = this.descriptor.get("key");
  this.name = this.descriptor.get("name");
  this.on("remote_plugin_installed", function (key, settings) {
    this.settings.hset(settings.clientKey, settings);
  });

  // defer configuration of the plugin until the express app has been configured
  var self = this;
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
        self.authenticate()(req, res, next);
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
}

proto.authenticate = function () {
  return oauth(this);
};

// returns the best available http client given a context request
proto.httpClient = function (req) {
  return (req.context && req.context.http) || require("request");
};

proto.register = function () {
  var self = this;
  var hosts = this.config.hosts();
  if (hosts) {
    self._registrations = {};
    self.logger.info("Registering plugin...");
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
