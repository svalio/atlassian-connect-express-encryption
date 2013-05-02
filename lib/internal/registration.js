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
  var hostRegUrls = _.keys(self._registrations);
  if (hostRegUrls.length > 0) {
    self.logger.info("Deregistering plugin...");
    return Q.allResolved(hostRegUrls.map(_.bind(deregister, self)));
  }
  return Q.resolve();
};

function register(hostRegUrl) {
  var self = this;
  var dfd = Q.defer();
  request.post({
    uri: hostRegUrl + "/rest/remotable-plugins/latest/installer",
    form: {url: self.config.localBaseUrl() + "/atlassian-plugin.xml"},
    jar: false
  }, function (err, res) {
    var bareHost = stripCredentials(hostRegUrl);
    if ((err && err.code !== "ECONNREFUSED") || res && res.statusCode !== 200) {
      logRegistrationFailure(self.logger, err, res, bareHost);
      dfd.resolve;
    }
    else if (res && res.statusCode === 200) {
      self.on("remote_plugin_installed", function (key, settings) {
        if (probablyEqualUrls(bareHost, settings.baseUrl)) {
          self.logger.info("Registered with " + bareHost + ".");
          self._registrations[hostRegUrl] = settings.clientKey;
        }
      });
      dfd.resolve(hostRegUrl);
    }
    else {
      dfd.resolve();
    }
  });
  return dfd.promise;
}

function logRegistrationFailure(logger, err, res, host) {
  var args = ["Failed to register with " + host];
  if (res && res.statusCode) args.push(" (" + res.statusCode + ")")
  if (err) args.push("\n" + err);
  if (res && res.body) args.push("\n" + res.body);
  logger.error.apply(logger, args);
}

function probablyEqualUrls(a, b) {
  if (a === b) return true;
  // @todo it's a huge, incorrect hack testing for *.local === localhost, but there's currently
  // no other way to connect a hostRegUrl and settings.baseUrl when the host reports a domain
  // other than the one the registration occurred on, as can happen with confluence
  var au = urls.parse(a);
  var bu = urls.parse(b);
  var ah = au.hostname;
  var bh = bu.hostname;
  if ((ah === "localhost" && /\.local$/.test(bh)) || (/\.local$/.test(ah) && bh === "localhost")) {
    au.hostname = "fake.com";
    delete au.host;
    bu.hostname = "fake.com";
    delete bu.host;
    return urls.format(au) === urls.format(bu);
  }
  return false;
}

function deregister(hostRegUrl) {
  var self = this;
  var dfd = Q.defer();
  request.del({
    uri: hostRegUrl + "/rest/remotable-plugins/latest/uninstaller/" + self.key,
    jar: false
  }, function (err, res) {
    var bareHost = stripCredentials(hostRegUrl);
    if ((err && err.code !== "ECONNREFUSED") || res && res.statusCode !== 204) {
      logRegistrationFailure(self.logger, err, res, bareHost);
      dfd.resolve();
    }
    else if (res && res.statusCode === 204) {
      var clientKey = self._registrations[hostRegUrl];
      function resolve() {
        self.logger.info("Deregistered with " + bareHost + ".");
        dfd.resolve(hostRegUrl);
      }
      if (clientKey) {
        self.settings.hdel(clientKey).then(resolve, resolve);
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

function stripTrailingSlash(str) {
  if(str.substr(-1) == '/') {
    return str.substr(0, str.length - 1);
  }
  return str;
}

function stripCredentials(url) {
  url = urls.parse(url);
  delete url.auth;
  return stripTrailingSlash(urls.format(url));
}
