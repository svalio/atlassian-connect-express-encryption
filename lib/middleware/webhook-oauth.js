var request = require('request');
var urls = require('url');
var _ = require('underscore');
var hostInfo = require('../internal/host-info');

function webhookOAuth(addon, basePath) {
  var enabled = addon.descriptor.webhooks('remote_plugin_enabled')[0];
  var enabledUrl = enabled && basePath + enabled.url;
  return function (req, res, next) {
    // allows disabling of oauth for testing/debugging
    if (/no-oauth/.test(process.env.AC_OPTS)) return next();
    var path = urls.parse(req.url).pathname;
    if (!enabled || path !== enabledUrl) {
      // not an installation request, so authenticate normally
      addon.authenticate()(req, res, function () {
        addon.emit('other_webhook_oauth_verification_triggered');
        next();
      });
    } else {
      // installation request
      function sendError(msg) {
        var code = 401;
        addon.logger.error('OAuth verification error:', code, msg);
        res.send(code, msg);
      }
      var regInfo = req.body;
      if (!regInfo || !_.isObject(regInfo)) {
        return sendError('No registration info provided.');
      }
      // verify that the specified host is in the registration whitelist;
      // this can be spoofed, but is a first line of defense against unauthorized registrations
      var baseUrl = regInfo.baseUrl;
      if (!baseUrl) {
        return sendError('No baseUrl provided in registration info.');
      }
      var host = urls.parse(baseUrl).hostname;
      var whitelisted = addon.config.whitelist().some(function (re) { return re.test(host); });
      if (!whitelisted) {
        return sendError('Host at ' + baseUrl + ' is not authorized to register.');
      }
      // next verify with the provided publicKey; this could be spoofed, but we will verify the key
      // in a later step if it checks out
      var publicKey = regInfo.publicKey;
      if (!publicKey) {
        return sendError('No public key provided for host at ' + baseUrl + '.');
      }
      addon.authenticate(publicKey)(req, res, function () {
        // in order to protect against the aforementioned spoofing, we next need to make a request back
        // to the specified host to get its public key, and then make sure that it matches the one just
        // used to verify the request's oauth signature
        hostInfo.get(baseUrl).then(
          function (info) {
            if (info.publicKey !== publicKey) {
              // if the returned key does not match the key specified in the installation request,
              // we must assume that this is a spoofing attack and reject the installation
              return sendError('Public keys do not match.');
            }
            // the installation request has been validated, so proceed
            addon.emit('enabled_webhook_oauth_verification_triggered');
            next();
          },
          function (err) {
            sendError('Unable to verify public key for host ' + baseUrl + ': ' + err);
          }
        );
      });
    }
  };
}

module.exports = webhookOAuth;
