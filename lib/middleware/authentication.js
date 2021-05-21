const moment = require("moment");
const jwt = require("atlassian-jwt");
const requestHandler = require("./request");
const _ = require("lodash");
const utils = require("../internal/utils");

const TOKEN_KEY_PARAM = "acpt";
const TOKEN_KEY_HEADER = `X-${TOKEN_KEY_PARAM}`;

function authenticateWebhook(addon) {
  return function (req, res, next) {
    addon.emit("webhook_auth_verification_triggered");

    authenticate(addon)(req, res, () => {
      addon.emit("webhook_auth_verification_successful");
      return next();
    });
  };
}

// Create a JWT token that can be used instead of a session cookie
function createSessionToken(addon, verifiedClaims, clientKey, settings) {
  const now = moment().utc();

  const baseJwt = {
    iss: settings.key || addon.key,
    iat: now.unix(),
    sub: verifiedClaims.sub,
    exp: now.add(addon.config.maxTokenAge(), "milliseconds").unix(),
    aud: [clientKey]
  };

  // If the context.user exists, then send that too. This is to handle
  // the interim period swapover from userKey to userAccountId.
  if (verifiedClaims.context) {
    baseJwt.context = verifiedClaims.context;
  }

  return jwt.encodeSymmetric(
    baseJwt,
    settings.sharedSecret,
    jwt.SymmetricAlgorithm.HS256
  );
}

async function getVerifiedClaims(addon, req, res, skipQshVerification) {
  const token = utils.extractJwtFromRequest(addon, req);
  if (!token) {
    return Promise.reject({
      code: 401,
      message: "Could not find authentication data on request",
      ctx: {
        ctx: _.omit(req.body, ["sharedSecret", "publicKey"])
      }
    });
  }

  let unverifiedClaims;
  try {
    unverifiedClaims = jwt.decodeSymmetric(
      token,
      "",
      jwt.SymmetricAlgorithm.HS256,
      true
    ); // decodeSymmetric without verification;
  } catch (e) {
    return Promise.reject({
      code: 401,
      message: `Invalid JWT: ${e.message}`,
      ctx: {}
    });
  }

  const issuer = unverifiedClaims.iss;
  if (!issuer) {
    return Promise.reject({
      code: 401,
      message: "JWT claim did not contain the issuer (iss) claim",
      ctx: {}
    });
  }

  const queryStringHash = unverifiedClaims.qsh;
  if (!queryStringHash && !skipQshVerification) {
    // session JWT tokens don't require a qsh
    return Promise.reject({
      code: 401,
      message: "JWT claim did not contain the query string hash (qsh) claim",
      ctx: {}
    });
  }

  const request = req;
  let clientKey = issuer;

  // The audience claim identifies the intended recipient, according to the JWT spec,
  // but we still allow the issuer to be used if 'aud' is missing.
  // Session JWTs make use of this (the issuer is the add-on in this case)
  if (!_.isEmpty(unverifiedClaims.aud)) {
    clientKey = unverifiedClaims.aud[0];
  }

  let settings;
  try {
    settings = await addon.settings.get("clientInfo", clientKey);
  } catch (err) {
    return Promise.reject({
      code: 500,
      message: `Could not lookup stored client data for ${clientKey}: ${err}`,
      ctx: {}
    });
  }

  if (!settings) {
    return Promise.reject({
      code: 401,
      message: `Could not find stored client data for ${clientKey}. Is this client registered?`,
      ctx: {}
    });
  }

  const secret = settings.sharedSecret;
  if (!secret) {
    return Promise.reject({
      code: 401,
      message: `Could not find JWT sharedSecret in stored client data for ${clientKey}`,
      ctx: {}
    });
  }

  let verifiedClaims;
  try {
    verifiedClaims = jwt.decodeSymmetric(
      token,
      secret,
      jwt.SymmetricAlgorithm.HS256,
      false
    );
  } catch (error) {
    return Promise.reject({
      code: 400,
      message: `Unable to decodeSymmetric JWT token: ${error}`,
      ctx: {}
    });
  }

  const expiry = verifiedClaims.exp;

  // todo build in leeway?
  if (expiry && moment().utc().unix() >= expiry) {
    return Promise.reject({
      code: 401,
      message: "Authentication request has expired. Try reloading the page.",
      ctx: {}
    });
  }

  if (
    !utils.validateQshFromRequest(
      verifiedClaims,
      request,
      addon,
      skipQshVerification
    )
  ) {
    return Promise.reject({
      code: 401,
      message: "Authentication failed: query hash does not match.",
      ctx: {}
    });
  }

  const sessionToken = createSessionToken(
    addon,
    verifiedClaims,
    clientKey,
    settings
  );
  res.setHeader(TOKEN_KEY_HEADER, sessionToken);

  // Invoke the request middleware (again) with the verified and trusted parameters

  // Base params
  const verifiedParams = {
    clientKey,
    hostBaseUrl: settings.baseUrl,
    token: sessionToken,
    key: settings.key
  };

  // Use the context.user if it exists. This is deprecated as per
  // https://ecosystem.atlassian.net/browse/AC-2424
  if (verifiedClaims.context) {
    verifiedParams.context = verifiedClaims.context;
    const user = verifiedClaims.context.user;
    if (user) {
      if (user.accountId) {
        verifiedParams.userAccountId = user.accountId;
      }
      if (user.userKey) {
        verifiedParams.userKey = user.userKey;
      }
    }
  }

  if (!verifiedParams.userAccountId) {
    // Otherwise use the sub claim, and assume it to be the AAID.
    // It will not be the AAID if they haven't opted in / if its before
    // the end of the deprecation period, but in that case context.user
    // will be used instead.
    verifiedParams.userAccountId = verifiedClaims.sub;
  }

  return verifiedParams;
}

function authenticate(addon, skipQshVerification) {
  return function (req, res, next) {
    function sendError({ code, message, ctx }) {
      addon.logger.warn(
        ctx,
        `Authentication verification error (${code}):  ${message}`
      );
      if (addon.config.expressErrorHandling()) {
        next({
          code,
          message
        });
      } else {
        res.format({
          text() {
            res.status(code).send(_.escape(message));
          },
          html() {
            if (addon.config.errorTemplate()) {
              res.statusCode = code;
              res.render("unauthorized", {
                message
              });
            } else {
              res.status(code).send(_.escape(message));
            }
          },
          json() {
            res.status(code).send({
              message
            });
          }
        });
      }
    }

    if (/no-auth/.test(process.env.AC_OPTS)) {
      console.warn(
        "Auth verification is disabled, skipping validation of request."
      );
      next();
      return;
    }

    getVerifiedClaims(addon, req, res, skipQshVerification)
      .then(verifiedParams => {
        const reqHandler = requestHandler(addon, verifiedParams);
        reqHandler(req, res, next);
      })
      .catch(error => {
        sendError(error);
      });
  };
}

module.exports = {
  authenticate,
  authenticateWebhook,
  getVerifiedClaims
};
