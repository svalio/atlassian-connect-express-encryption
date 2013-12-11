var jwt = require('jwt-simple');

var jwtMiddleware = {};

jwtMiddleware.authenticate = function (addon) {
    return function (req, res, next) {

        function sendError(code, msg) {
            addon.logger.error('Installation verification error:', code, msg);
            res.send(code, msg);
        }

        if (/no-auth/.test(process.env.AC_OPTS)) {
            console.warn("Auth verification is disabled, skipping validation of request.");
            next();
            return;
        }
        var token = req.param('jwt');

        if (!token) {
            sendError(401, 'Could not find authentication data on request');
            return;
        }

        var unverifiedClaims = jwt.decode(token, '', true); // decode without verification
        var issuer = unverifiedClaims.iss;
        if (!issuer) {
            sendError('JWT claim did not contain the issuer (iss) parameter');
            return;
        }
        console.log("issuer = " + issuer);

        addon.settings.get('clientInfo', issuer).then(function (settings) {
            var secret = settings.sharedSecret;
            if (!secret) {
                sendError(401, 'Could not find JWT sharedSecret for in stored client data for ' + issuer);
                return;
            }
            next();
        }, function (err) {
            sendError(500, 'Could not lookup stored client data for ' + issuer + ': ' + err);
        });
    };
};

module.exports = jwtMiddleware;
