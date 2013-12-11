var request = require('request');
var _ = require('underscore');


/**
 * Verifies that authentication is valid on a webhook request
 * @param addon
 * @returns {Function} middleware function that verifies the webhook
 */
function authenticateWebhook(addon) {
    return function (req, res, next) {
        addon.emit('webhook_auth_verification_triggered');
        // allows disabling of auth for testing/debugging
        if (/no-auth/.test(process.env.AC_OPTS)) {
            console.warn("Auth verification is disabled, skipping validation of incoming webhook.");
            return next();
        }

        addon.authenticate()(req, res, function () {
            addon.emit('webhook_auth_verification_successful');
            return next();
        });
    }
}

module.exports = authenticateWebhook;
