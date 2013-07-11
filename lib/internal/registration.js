var request = require("request");
var paths = require("path");
var urls = require("url");
var _ = require("underscore");
var RSVP = require("rsvp");
var lt = require('localtunnel').client;
var hostInfo = require("./host-info");
var errmsg = require("./errors").errmsg;

function createTunnel(addon){
  var promise = new RSVP.Promise;
  var nonLocalHosts = [];
  if (process.env['FEEBS_LOCAL_BASE_URL']) {
    promise.resolve();
  } else {
    nonLocalHosts = _.filter(addon.config.hosts(), function(host){
      return !/localhost/.test(host);
    });
  }
  if(nonLocalHosts.length > 0) {
    var client = lt.connect({
      host: 'http://localtunnel.me',
      port: addon.config.port()
    });
    client.on('url', function(url) {
      var ltu = urls.parse(url);
      var lbu = urls.parse(addon.config.localBaseUrl());
      lbu.protocol = ltu.protocol;
      lbu.host = ltu.host;
      process.env['FEEBS_LOCAL_BASE_URL'] = urls.format(lbu);
      addon.logger.info("Local tunnel established at " + url);
      addon.emit('localtunnel_started');
      promise.resolve();
    });

    client.on('error', function(err) {
      addon.logger.error("Failed to establish local tunnel");
      promise.reject(err && err.stack ? err : new Error(err));
    });
  } else {
    promise.resolve();
  }
  return promise;
}

exports.register = function (isReregistration) {
  var promise = new RSVP.Promise;
  var self = this;
  if (/no-reg/.test(process.env.FEEBS_OPTS)) {
    self.logger.warn("Auto-(de)registration disabled with FEEBS_OPTS=no-reg");
    return promise.resolve();
  }
  self._registrations = {};
  var hostRegUrls = self.config.hosts();
  createTunnel(self).then(
    function () {
      if (hostRegUrls && hostRegUrls.length > 0) {
        if (!isReregistration) {
          self.logger.info("Registering add-on...");
          process.once("SIGINT", function () {
            console.log();
            function sigint() {
              process.kill(process.pid, "SIGINT");
            }
            self.deregister()
              .then(
                function () {
                  self.emit("addon_deregistered");
                  sigint();
                },
                function () {
                  self.logger.error.apply(self.logger, arguments);
                  sigint();
                }
              );
          });
        }
        RSVP.all(hostRegUrls.map(_.bind(register, self))).then(
          function () {
            promise.resolve();
          }
        );
      }
    },
    function (err) {
      self.logger.error(errmsg(err));
      promise.reject(err);
    }
  );
  promise.then(function () { self.emit("addon_registered"); });
  return promise;
};

exports.deregister = function () {
  var self = this;
  var hostRegUrls = _.keys(self._registrations);
  var promise;
  if (!/no-dereg/.test(process.env.FEEBS_OPTS) && hostRegUrls.length > 0) {
    self.logger.info("Deregistering add-on...");
    promise = RSVP.all(hostRegUrls.map(_.bind(deregister, self)));
  }
  else {
    // will be just RSVP.resolve() in v2.x
    promise = new RSVP.Promise;
    promise.resolve();
  }
  return promise;
};

function register(hostRegUrl) {
  var self = this;
  var promise = new RSVP.Promise;

  hostInfo.get(hostRegUrl).then(
    function (info) {
      var clientKey = info.key;
      var localUrl = urls.parse(self.config.localBaseUrl());
      localUrl.pathname = paths.join(localUrl.pathname, "atlassian-plugin.xml");
      var descriptorUrl = urls.format(localUrl);
      function done() {
        var hostBaseUrl = stripCredentials(hostRegUrl);
        self.logger.info("Registered with host " + clientKey + " @ " + hostBaseUrl);
        self._registrations[hostRegUrl] = clientKey;
        promise.resolve();
      }
      function fallback(args) {
        self.logger.warn("Falling back to deprecated registration service");
        registerConnect(hostRegUrl, descriptorUrl).then(done, fail);
      }
      function fail(args) {
        self.logger.error(registrationError("register", clientKey, args[0], args[1]));
        promise.resolve();
      }
      registerUpm(hostRegUrl, descriptorUrl).then(done, fallback);
    },
    function () {
      // ignore connection errors as registration no-ops
      promise.resolve();
    }
  );

  return promise;
}

function registerUpm(hostRegUrl, descriptorUrl) {
  var promise = new RSVP.Promise;
  request.head({
    uri: hostRegUrl + "/rest/plugins/1.0/",
    jar: false
  }, function (err, res) {
    if (err || (res && res.statusCode !== 200)) return promise.reject([err, res]);
    var upmToken = res.headers["upm-token"];
    request.post({
      uri: hostRegUrl + "/rest/plugins/1.0/?token=" + upmToken,
      headers: {"content-type": "application/vnd.atl.plugins.remote.install+json"},
      body: JSON.stringify({pluginUri: descriptorUrl}),
      jar: false
    }, function (err, res) {
      if (err || (res && res.statusCode !== 202)) return promise.reject([err, res]);
      promise.resolve();
    });
  });
  return promise;
}

function registerConnect(hostRegUrl, descriptorUrl) {
  var promise = new RSVP.Promise;
  request.post({
    uri: hostRegUrl + "/rest/remotable-plugins/latest/installer",
    form: {url: descriptorUrl},
    jar: false
  }, function (err, res) {
    if (err || (res && res.statusCode !== 200)) return promise.reject([err, res]);
    promise.resolve();
  });
  return promise;
}

function deregister(hostRegUrl) {
  var self = this;
  var promise = new RSVP.Promise;
  var clientKey = self._registrations[hostRegUrl];
  function done() {
    var hostBaseUrl = stripCredentials(hostRegUrl);
    self.logger.info("Unregistered on host " + clientKey + " @ " + hostBaseUrl);
    self.settings.del("clientInfo", clientKey).then(
      function () {
        promise.resolve();
      },
      function (err) {
        self.logger.error(errmsg(err));
        promise.resolve();
      }
    );
  }
  function fallback() {
    deregisterConnect(self, hostRegUrl, clientKey).then(done, fail);
  }
  function fail(args) {
    self.logger.error(registrationError("deregister", clientKey, args[0], args[1]));
    promise.resolve();
  }
  if (clientKey) {
    deregisterUpm(self, hostRegUrl, clientKey).then(done, fallback);
  }
  else {
    promise.resolve();
  }
  return promise;
}

function deregisterUpm(self, hostRegUrl, clientKey) {
  var promise = new RSVP.Promise;
  request.del({
    uri: hostRegUrl + "/rest/plugins/1.0/" + self.key + "-key",
    jar: false
  }, function (err, res) {
    if (err || (res && res.statusCode !== 200)) return promise.reject([err, res]);
    promise.resolve();
  });
  return promise;
}

function deregisterConnect(self, hostRegUrl, clientKey) {
  var promise = new RSVP.Promise;
  request.del({
    uri: hostRegUrl + "/rest/remotable-plugins/latest/uninstaller/" + self.key,
    jar: false
  }, function (err, res) {
    if (err || (res && res.statusCode !== 204)) return promise.reject([err, res]);
    promise.resolve();
  });
  return promise;
}

function registrationError(action, clientKey, err, res) {
  var args = ["Failed to " + action + " with host " + clientKey];
  if (res && res.statusCode) args[0] = args[0] + (" (" + res.statusCode + ")");
  if (err) args.push(errmsg(err));
  if (res && res.body) args.push(res.body);
  return args.join("\n");
}

function stripCredentials(url) {
  url = urls.parse(url);
  delete url.auth;
  return urls.format(url);
}
