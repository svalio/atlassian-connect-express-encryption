// middleware

var token = require('../internal/token');

module.exports = function (addon) {

  var TOKEN_KEY_PARAM = "acpt";
  var TOKEN_KEY_HEADER = "X-" + TOKEN_KEY_PARAM;

  var maxTokenAge = addon.config.maxTokenAge();
  var allowTokenRefresh = addon.config.allowTokenRefresh();

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
    var tokenHandler = token(addon.config.privateKey(), addon.config.publicKey());

    tokenHandler.verify(tokenValue, maxTokenAge,
      function(verifiedToken) {
        addon.emit('token_verification_successful');
        res.locals({
          hostBaseUrl: verifiedToken.h,
          clientKey: verifiedToken.k,
          userId: verifiedToken.u
        });
        if (allowTokenRefresh) {
          res.locals.token = tokenHandler.refresh(verifiedToken);
          res.setHeader(TOKEN_KEY_HEADER, res.locals.token);
        }
        next();
      },
      function(error) {
        addon.emit('token_verification_failed');
        addon.logger.error('Token verification error:', error.message);
        res.send(401, error.message);
      }
    );
  };
};
