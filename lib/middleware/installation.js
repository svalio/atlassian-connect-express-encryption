// Handles the lifecycle "installed" event of a connect addon.

var request = require('request');
var urls = require('url');
var _ = require('underscore');
var hostInfo = require('../internal/host-info');

function addonInstalled(addon) {
    return function (req, res, next) {
        function sendError(msg) {
            console.log("error " + msg);
            var code = 401;
            addon.logger.error('Installation verification error:', code, msg);
            res.send(code, msg);
        }

        var regInfo = req.body;
        if (!regInfo || !_.isObject(regInfo)) {
            sendError('No registration info provided.');
            return;
        }

        // verify that the specified host is in the registration whitelist;
        // this can be spoofed, but is a first line of defense against unauthorized registrations
        var baseUrl = regInfo.baseUrl;
        if (!baseUrl) {
            sendError('No baseUrl provided in registration info.');
            return;
        }

        var host = urls.parse(baseUrl).hostname;
        var whitelisted = addon.config.whitelist().some(function (re) { return re.test(host); });
        if (!whitelisted) {
            sendError('Host at ' + baseUrl + ' is not authorized to register.');
            return;
        }

        // next verify with the provided publicKey; this could be spoofed, but we will verify the key
        // in a later step if it checks out
        var publicKey = regInfo.publicKey;
        if (!publicKey) {
            sendError('No public key provided for host at ' + baseUrl + '.');
            return;
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
                            sendError('Public keys do not match. Was: ' + info.publicKey + ', expected: ' + publicKey);
                            return;
                        }
                        // the installation request has been validated, so proceed
                        addon.emit('enabled_webhook_auth_verification_successful');
                        next();
                    },
                    function (err) {
                        sendError('Unable to verify public key for host ' + baseUrl + ': ' + err);
                    }
            );
        });
    }
}

module.exports = addonInstalled;
