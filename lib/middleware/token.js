// middleware

var token = require('../internal/token');
var request = require('./request');

module.exports = function (addon) {

    var requestHandler = request(addon);
    var tokenHandler = token(addon.config.privateKey(), addon.config.publicKey());

    var TOKEN_KEY_PARAM = "acpt";
    var TOKEN_KEY_HEADER = "X-" + TOKEN_KEY_PARAM;

    var maxTokenAge = addon.config.maxTokenAge();

    function isTokenVerificationDisabled() {
        return /no-token-verfication/.test(process.env.AC_OPTS);
    }

    function getTokenFromRequest(req) {
        return req.param(TOKEN_KEY_PARAM) || req.header(TOKEN_KEY_HEADER);
    }

    return function (req, res, next) {
        if (isTokenVerificationDisabled()) {
            return next();
        }
        addon.emit('token_verification_triggered');
        var tokenValue = getTokenFromRequest(req);
        tokenHandler.verify(tokenValue, maxTokenAge,
                function (verifiedToken) {
                    addon.emit('token_verification_successful');
                    var token = tokenHandler.refresh(verifiedToken);
                    var params = {
                        hostBaseUrl: verifiedToken.host,
                        clientKey: verifiedToken.key,
                        userId: verifiedToken.user,
                        token: token
                    };
                    res.setHeader(TOKEN_KEY_HEADER, token);
                    requestHandler.augmentRequest(params, req, res, next);
                },
                function (error) {
                    addon.emit('token_verification_failed');
                    var code = 401;
                    var message = error.message;
                    addon.logger.error('Token verification error:', message);
                    if (addon.config.expressErrorHandling()) {
                        next({
                            code: code,
                            message: message
                        });
                    } else {
                        res.send(code, message);
                    }
                    res.send(code, message);
                }
        );
    };
};
