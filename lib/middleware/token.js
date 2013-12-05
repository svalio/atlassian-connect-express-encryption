// middleware

var token = require('../internal/token');

module.exports = function (addon) {

  var TOKEN_KEY_PARAM = "acpt";
  var TOKEN_KEY_HEADER = "X-" + TOKEN_KEY_PARAM;

  var maxTimestampAge = 15 * 60 * 1000 ;

  function isTokenVerificationDisabled() {
    return /no-token-verfication/.test(process.env.AC_OPTS);
  }

  function getTokenFromRequest(req) {
    return req.param(TOKEN_KEY_PARAM) || req.header(TOKEN_KEY_HEADER);
  }

  return function (req, res, next) {
    addon.emit('token_verification_triggered');

    if (isTokenVerificationDisabled()) {
      return next();
    }

    var tokenHandler = token(addon.config.secret());
    var tokenValue = getTokenFromRequest(req);

    tokenHandler.verify(tokenValue, maxTimestampAge,
      function(verifiedToken) {
        addon.emit('token_verification_successful');
        res.locals.hostBaseUrl = verifiedToken.h;
        res.locals.userId = verifiedToken.u;
        res.locals.token = tokenHandler.refresh(verifiedToken);
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
