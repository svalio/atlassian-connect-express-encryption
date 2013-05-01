var request = require("request");
var urls = require("url");
var _ = require("underscore");
var Q = require("q");
var lt = require('localtunnel').client;

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
  var hosts = self.config.hosts();
  createTunnel(self).done(function(){
    if (hosts && hosts.length > 0) {
      self._registrations = {};
      if (!isReregistration) {
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
                // If more than one host is defined, the following logic fails...
                if (urls.parse(host).hostname === urls.parse(settings.baseUrl).hostname) {
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
  });
};

exports.deregister = function () {
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
              self.logger.info("Deregistered with " + bareHost + ".");
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

function register(host) {
  var self = this;
  var dfd = Q.defer();
  request.post({
    uri: host + "/rest/remotable-plugins/latest/installer",
    form: {url: self.config.localBaseUrl() + "/atlassian-plugin.xml"},
    jar: false
  }, function (err, res, body) {
    if ((err && err.code !== "ECONNREFUSED") || res && res.statusCode !== 200) {
      var args = ["Failed to register with " + stripCredentials(host) + ": "];
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

function deregister(host) {
  var self = this;
  var dfd = Q.defer();
  request.del({
    uri: host + "/rest/remotable-plugins/latest/uninstaller/" + this.key,
    jar: false
  }, function (err, res) {
    if ((err && err.code !== "ECONNREFUSED") || res && res.statusCode !== 204) {
      var args = ["Failed to deregister with " + stripCredentials(host) + ": "];
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

function stripCredentials(url) {
  url = urls.parse(url);
  delete url.auth;
  return urls.format(url);
}
