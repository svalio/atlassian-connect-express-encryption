// token middleware

const authentication = require("./authentication");

module.exports = function (addon) {
  const SKIP_QSH_VERIFICATION = true;

  const authenticationHandler = authentication.authenticate(
    addon,
    SKIP_QSH_VERIFICATION
  );

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
