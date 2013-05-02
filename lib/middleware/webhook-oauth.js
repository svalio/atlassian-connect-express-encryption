var request = require("request");
var urls = require("url");
var _ = require("underscore");
var hostInfo = require("../internal/host-info");

function webhookOAuth(plugin, basePath) {
  var installed = plugin.descriptor.webhooks("remote_plugin_installed")[0];
  var installedUrl = installed && basePath + installed.get("url");
  return function (req, res, next) {
    var path = urls.parse(req.url).pathname;
    if (!installed || path !== installedUrl) {
      // not an installation request, so authenticate normally
      plugin.authenticate()(req, res, next);
    }
    else {
      function sendError(msg) {
        var code = 403;
        plugin.logger.error("OAuth verification error:", code, msg);
        res.send(code, msg);
      }
      // installation request
      var regInfo = req.body;
      if (!regInfo || !_.isObject(regInfo)) {
        return sendError("No registration info provided.");
      }
      // verify that the specified host is in the registration whitelist;
      // this can be spoofed, but is a first line of defense against unauthorized registrations
      var baseUrl = regInfo.baseUrl;
      if (!baseUrl) {
        return sendError("No baseUrl provided in registration info.");
      }
      var host = urls.parse(baseUrl).hostname;
      var whitelisted = plugin.config.whitelist().some(function (re) { return re.test(host); });
      if (!whitelisted) {
        return sendError("Host at " + baseUrl + " is not authorized to register.");
      }
      // next verify with the provided publicKey; this could be spoofed, but we will verify the key
      // in a later step if it checks out
      var publicKey = regInfo.publicKey;
      if (!publicKey) {
        return sendError("No public key provided for host at " + baseUrl + ".");
      }
      plugin.authenticate(publicKey)(req, res, function () {
        // in order to protect against the aforementioned spoofing, we next need to make a request back
        // to the specified host to get its public key, and then make sure that it matches the one just
        // used to verify the request's oauth signature
        hostInfo.get(baseUrl).then(
          function (info) {
            if (info.publicKey !== publicKey) {
              // if the returned key does not match the key specified in the installation request,
              // we must assume that this is a spoofing attack and reject the installation
              return sendError("Public keys do not match.");
            }
            // the installation request has been validated, so proceed
            next();
          },
          function (err) {
            sendError("Unable to verify public key for host " + baseUrl + ": " + err);
          }
        );
      });
    }
  };
}

module.exports = webhookOAuth;
