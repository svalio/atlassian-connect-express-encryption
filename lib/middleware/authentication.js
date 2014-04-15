var moment = require('moment');
var token = require('../internal/token');
var jwt = require('../internal/jwt');
var _ = require('lodash');

var authentication = {};

authentication.authenticateWebhook = function (addon) {
    var self = this;
    return function (req, res, next) {
        addon.emit('webhook_auth_verification_triggered');

        self.authenticate(addon)(req, res, function () {
            addon.emit('webhook_auth_verification_successful');
            return next();
        });
    }
};

function extractJwtFromRequest(req, addon) {
    var token = req.param('jwt');

    // if there was no token in the query-string then fall back to checking the Authorization header
    var authHeader = req.headers["authorization"]; // the header name appears as lower-case
    if (authHeader && authHeader.indexOf("JWT ") == 0) {
        if (token) {
            addon.logger.warn("JWT token found in query and in header: using query value.");
        }
        else {
            token = authHeader.substring(4);
        }
    }
    return token;
}

authentication.extractUnverifiedClientKeyFromRequest = function(req, addon) {
    var token = extractJwtFromRequest(req, addon);
    var unverifiedClaims = token ? jwt.decode(token, '', true) : null; // decode without verification
    return unverifiedClaims ? unverifiedClaims.iss : null;
};

authentication.authenticate = function (addon) {

    var tokenGenerator = token(addon.config.privateKey(), addon.config.publicKey());

    return function (req, res, next) {

        function sendError(code, msg) {
            addon.logger.error('Authentication verification error:', code, msg);
            res.send(code, _.escape(msg));
        }

        function success(jwtToken, remoteBaseUrl) {
            if (jwtToken && jwtToken.iss && req.session) {
                req.session.clientKey = jwtToken.iss;
            }
            createToken(jwtToken, remoteBaseUrl);
            next();
        }

        function createToken(jwtToken, remoteBaseUrl) {
            if (jwtToken && jwtToken.iss) {
                res.locals.token = tokenGenerator.create(remoteBaseUrl, jwtToken.iss, jwtToken.sub);
            }
        }

        if (/no-auth/.test(process.env.AC_OPTS)) {
            console.warn("Auth verification is disabled, skipping validation of request.");
            success();
            return;
        }

        var token = extractJwtFromRequest(req, addon);
        if (!token) {
            sendError(401, 'Could not find authentication data on request');
            return;
        }

        var unverifiedClaims = jwt.decode(token, '', true); // decode without verification
        var issuer = unverifiedClaims.iss;
        if (!issuer) {
            sendError('JWT claim did not contain the issuer (iss) claim');
            return;
        }

        var queryStringHash = unverifiedClaims.qsh;
        if (!queryStringHash) {
            sendError(401, 'JWT claim did not contain the query string hash (qsh) claim');
            return;
        }

        var request = req;

        addon.settings.get('clientInfo', issuer).then(function (settings) {
            if (!settings) {
                sendError(401, 'Could not find stored client data for ' + issuer + '. Is this client registered?');
                return;
            }
            var secret = settings.sharedSecret;
            var remoteBaseUrl = settings.baseUrl;
            if (!secret) {
                sendError(401, 'Could not find JWT sharedSecret in stored client data for ' + issuer);
                return;
            }
            var verifiedClaims = jwt.decode(token, secret, false);

            var expiry = verifiedClaims.exp;

            // todo build in leeway?
            if (expiry && moment().utc().unix() >= expiry) {
                sendError(401, 'Authentication request has expired.');
                return;
            }

            // First check query string params
            var expectedHash = jwt.createQueryStringHash(request, false, addon.config.baseUrl.href);
            var signatureHashVerified = verifiedClaims.qsh === expectedHash;
            if (!signatureHashVerified) {
                // Send the error message for the first verification - it's 90% more likely to be the one we want.
                var error = 'Auth failure: Query hash mismatch: Received: "' + verifiedClaims.qsh + '" but calculated "' + expectedHash + '". ' +
                            'Canonical query was: "' + jwt.createCanonicalRequest(request, addon.config.baseUrl.href);
                // If that didn't verify, it might be a post/put - check the request body too
                expectedHash = jwt.createQueryStringHash(request, true);
                signatureHashVerified = verifiedClaims.qsh === expectedHash;
                if (!signatureHashVerified) {
                    addon.logger.error(error);
                    sendError(401, 'Authentication failed: query hash does not match.');
                    return;
                }
            }

            success(verifiedClaims, remoteBaseUrl);
        }, function (err) {
            sendError(500, 'Could not lookup stored client data for ' + issuer + ': ' + err);
        });
    };
};

module.exports = authentication;
