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

    var tokenValue = getTokenFromRequest(req);
    token.verify(tokenValue, maxTimestampAge,
      function(token) {
        addon.emit('token_verification_successful');
        next();
      },
      function(error) {
        addon.emit('token_verification_failed');
        addon.logger.debug('Token verification error:', code, msg);
        res.send(401, error.message);
      }
    );

  };

};
