var request = require("request");
var urls = require("url");
var _ = require("underscore");
var Q = require("q");
var lt = require('localtunnel').client;
var hostInfo = require("./host-info");

function createTunnel(plugin){
  var deferred = Q.defer();
  var nonLocalHosts = [];
  if (process.env['AP3_LOCAL_BASE_URL']) {
    deferred.resolve();
  } else {
    nonLocalHosts = _.filter(plugin.config.hosts(), function(host){
      return !/localhost/.test(host);
    });
  }
  if(nonLocalHosts.length > 0) {
    var client = lt.connect({
      host: 'http://localtunnel.me',
      port: plugin.config.port()
    });
    client.on('url', function(url) {
      process.env['AP3_LOCAL_BASE_URL'] = url;
      plugin.logger.info("Local tunnel established " + url);
      deferred.resolve();
    });
    client.on('error', function(err) {
      deferred.reject(new Error(err));
    });
  } else {
    deferred.resolve();
  }
  return deferred.promise;
}

exports.register = function (isReregistration) {
  var self = this;
  self._registrations = {};
  var hostRegUrls = self.config.hosts();
  createTunnel(self).then(
    function () {
      if (hostRegUrls && hostRegUrls.length > 0) {
        if (!isReregistration) {
          self.logger.info("Registering plugin...");
          process.once("SIGINT", function () {
            console.log();
            function exit() { process.exit(1); }
            self.deregister().then(exit, function () {
              self.logger.error.apply(self.logger, arguments);
              exit();
            });
          });
        }
        hostRegUrls.forEach(_.bind(register, self));
      }
    },
    function () {
      self.logger.error.apply(self.logger, arguments);
    }
  );
};

exports.deregister = function () {
  var self = this;
  var hostRegUrls = self.config.hosts();
  if (hostRegUrls.length > 0) {
    self.logger.info("Deregistering plugin...");
    return Q.allResolved(hostRegUrls.map(_.bind(deregister, self)));
  }
  return Q.resolve();
};

function register(hostRegUrl) {
  var self = this;
  var dfd = Q.defer();

  hostInfo.get(hostRegUrl).then(
    function (info) {
      self._registrations[hostRegUrl] = info.key;
      request.post({
        uri: hostRegUrl + "/rest/remotable-plugins/latest/installer",
        form: {url: self.config.localBaseUrl() + "/atlassian-plugin.xml"},
        jar: false
      }, function (err, res) {
        if ((err && err.code !== "ECONNREFUSED") || (res && res.statusCode !== 200)) {
          logRegistrationFailure(self.logger, err, res, info.key);
          dfd.resolve();
        }
        else if (res && res.statusCode === 200) {
          self.logger.info("Registered with host " + info.key + ".");
          dfd.resolve(hostRegUrl);
        }
        else {
          dfd.resolve();
        }
      });
    },
    // ignore connection errors as registration no-ops
    dfd.resolve
  );

  return dfd.promise;
}

function deregister(hostRegUrl) {
  var self = this;
  var dfd = Q.defer();
  request.del({
    uri: hostRegUrl + "/rest/remotable-plugins/latest/uninstaller/" + self.key,
    jar: false
  }, function (err, res) {
    var clientKey = self._registrations[hostRegUrl];
    if ((err && err.code !== "ECONNREFUSED") || (res && res.statusCode !== 204)) {
      logRegistrationFailure(self.logger, err, res, clientKey, "de");
      dfd.resolve();
    }
    else if (res && res.statusCode === 204) {
      function resolve() {
        self.logger.info("Deregistered with host " + clientKey + ".");
        dfd.resolve(hostRegUrl);
      }
      if (clientKey) {
        self.settings.hdel(clientKey).then(resolve, function (err) {
          self.logger.error(err);
          resolve();
        });
      }
      else {
        resolve();
      }
    }
    else {
      dfd.resolve();
    }
  });
  return dfd.promise;
}

function logRegistrationFailure(logger, err, res, key, prefix) {
  var args = ["Failed to " + (prefix || "") + "register with host " + key];
  if (res && res.statusCode) args[0] = args[0] + (" (" + res.statusCode + ")");
  args[0] = args[0] + ".";
  if (err) args.push("\n" + err);
  if (res && res.body) args.push("\n" + res.body);
  logger.error.apply(logger, args);
}
