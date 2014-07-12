// middleware
// TODO: Can be removed once we no longer support 'checkValidToken'

var authentication = require('./authentication');

module.exports = function (addon) {

    var authenticationHandler = authentication.authenticate(addon);

    function isTokenVerificationDisabled() {
        return /no-token-verfication/.test(process.env.AC_OPTS);
    }

    return function (req, res, next) {

        if (isTokenVerificationDisabled()) {
            return next();
        }

        authenticationHandler(req, res, next);
    };
};
