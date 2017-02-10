// Handles the lifecycle "installed" event of a connect addon.

var urls = require('url');
var _ = require('lodash');

function verifyInstallation(addon) {
    return function (req, res, next) {
        function sendError(msg) {
            var code = 401;
            addon.logger.error('Installation verification error:', code, msg);
            if (addon.config.expressErrorHandling()) {
                next({
                    code: code,
                    message: msg
                });
            } else {
                res.status(code).send(_.escape(msg));
            }
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
        var whitelisted = addon.config.whitelistRegexp().some(function (re) {
            return re.test(host);
        });
        if (!whitelisted) {
            return sendError('Host at ' + baseUrl + ' is not authorized to register as the host does not match the ' +
                'registration whitelist (' + addon.config.whitelist() + ').');
        }

        var clientKey = regInfo.clientKey;
        if (!clientKey) {
            sendError('No client key provided for host at ' + baseUrl + '.');
            return;
        }

        addon.settings.get('clientInfo', clientKey).then(function (settings) {
            if (settings) {
                addon.logger.info('Found existing settings for client ' + clientKey + '. Authenticating reinstall request');
                addon.authenticate()(req, res, function () {
                    if (req.context.clientKey === clientKey) {
                        next();
                    } else {
                        sendError('clientKey in install payload did not match authenticated client');
                    }
                });
            } else {
                next();
            }
        });
    };
}

module.exports = verifyInstallation;
