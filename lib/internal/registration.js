var request = require("request");
var path = require("path");
var urls = require("url");
var _ = require("underscore");
var RSVP = require("rsvp");
var lt = require('localtunnel').client;
var hostInfo = require("./host-info");

function createTunnel(addon){
  var promise = new RSVP.Promise;
  var nonLocalHosts = [];
  if (process.env['AP3_LOCAL_BASE_URL']) {
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
      process.env['AP3_LOCAL_BASE_URL'] = urls.format(lbu);
      addon.logger.info("Local tunnel established at " + url);
      addon.emit('localtunnel_started');
      promise.resolve();
    });

    client.on('error', function(err) {
      addon.logger.error("Failed to establish local tunnel");
      promise.reject(new Error(err));
    });
  } else {
    promise.resolve();
  }
  return promise;
}

exports.register = function (isReregistration) {
  var promise = new RSVP.Promise;
  var self = this;
  if (process.env.FEEBS_REGISTER === "false") {
    self.logger.warn("Auto-(de)registration disabled with FEEBS_REGISTER=false");
    promise.resolve();
  }
  else {
    self._registrations = {};
    var hostRegUrls = self.config.hosts();
    createTunnel(self).then(
      function () {
        if (hostRegUrls && hostRegUrls.length > 0) {
          if (!isReregistration) {
            self.logger.info("Registering add-on...");
            process.once("SIGINT", function () {
              console.log();
              function exit() {
                if (!/test/g.test(process.env.FEEBS_OPTS)) {
                  process.exit(1);
                };
              }
              self.deregister().then(exit, function () {
                self.logger.error.apply(self.logger, arguments);
                exit();
              });
            });
          }
          self.rootDfd = promise;
          hostRegUrls.forEach(_.bind(register, self));
        }
      },
      function () {
        self.logger.error.apply(self.logger, arguments);
        promise.reject();
      }
    );
  }
  return promise;
};

exports.deregister = function () {
  var self = this;
  var hostRegUrls = self.config.hosts();
  if (hostRegUrls.length > 0) {
    self.logger.info("Deregistering add-on...");
    return RSVP.all(hostRegUrls.map(_.bind(deregister, self)));
  }
  return RSVP.resolve();
};

function register(hostRegUrl) {
  var self = this;
  var promise = new RSVP.Promise;

  hostInfo.get(hostRegUrl).then(
    function (info) {
      self._registrations[hostRegUrl] = info.key;
      localUrl = urls.parse(self.config.localBaseUrl());
      localUrl.pathname = path.join(localUrl.pathname, "atlassian-plugin.xml");
      request.post({
        uri: hostRegUrl + "/rest/remotable-plugins/latest/installer",
        form: {url: urls.format(localUrl)},
        jar: false
      }, function (err, res) {
        if ((err && err.code !== "ECONNREFUSED") || (res && res.statusCode !== 200)) {
          logRegistrationFailure(self.logger, err, res, info.key);
          self.emit('addon_registered');
          self.rootDfd.resolve();
          promise.resolve();
        }
        else if (res && res.statusCode === 200) {
          self.logger.info("Registered with host " + info.key + " (" + stripCredentials(hostRegUrl) + ")" );
          self.emit('addon_registered');
          self.rootDfd.resolve();
          promise.resolve(hostRegUrl);
        }
        else {
          self.emit('addon_registered');
          self.rootDfd.resolve();
          promise.resolve();
        }
      });
    },
    // ignore connection errors as registration no-ops
    promise.resolve
  );

  return promise;
}

function deregister(hostRegUrl) {
  var self = this;
  var promise = new RSVP.Promise;
  request.del({
    uri: hostRegUrl + "/rest/remotable-plugins/latest/uninstaller/" + self.key,
    jar: false
  }, function (err, res) {
    var clientKey = self._registrations[hostRegUrl];
    if ((err && err.code !== "ECONNREFUSED") || (res && res.statusCode !== 204)) {
      logRegistrationFailure(self.logger, err, res, clientKey, "de");
      promise.resolve();
    }
    else if (res && res.statusCode === 204) {
      function resolve() {
        self.emit('addon_deregistered');
        self.logger.info("Unregistered on host " + clientKey);
        promise.resolve(hostRegUrl);
      }
      if (clientKey) {
        self.settings.del(clientKey).then(resolve, function (err) {
          self.logger.error(err);
          resolve();
        });
      }
      else {
        resolve();
      }
    }
    else {
      promise.resolve();
    }
  });
  return promise;
}

function logRegistrationFailure(logger, err, res, key, prefix) {
  if(prefix === "de") return;
  var args = ["Failed to " + (prefix || "") + "register with host " + key];
  if (res && res.statusCode) args[0] = args[0] + (" (" + res.statusCode + ")");
  args[0] = args[0] + ".";
  if (err) args.push("\n" + err);
  if (res && res.body) args.push("\n" + res.body);
  logger.error.apply(logger, args);
}

function stripCredentials(url) {
  url = urls.parse(url);
  delete url.auth;
  return urls.format(url);
}
