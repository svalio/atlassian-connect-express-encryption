// Handles the lifecycle "installed" event of a connect addon.

const urls = require("url");
const moment = require("moment");
const jwt = require("atlassian-jwt");
const _ = require("lodash");
const request = require("request");
const utils = require("../internal/utils");

const CONNECT_INSTALL_KEYS_CDN_URL =
  "https://connect-install-keys.atlassian.com";

function verify(addon) {
  return function (req, res, next) {
    function sendError(msg) {
      const code = 401;
      addon.logger.error("Installation verification error:", code, msg);
      if (addon.config.expressErrorHandling()) {
        next({
          code,
          message: msg
        });
      } else {
        res.status(code).send(_.escape(msg));
      }
    }

    const regInfo = req.body;
    if (!regInfo || !_.isObject(regInfo)) {
      sendError("No registration info provided.");
      return;
    }

    // verify that the specified host is in the registration whitelist;
    // this can be spoofed, but is a first line of defense against unauthorized registrations
    const baseUrl = regInfo.baseUrl;
    if (!baseUrl) {
      sendError("No baseUrl provided in registration info.");
      return;
    }

    const host = urls.parse(baseUrl).hostname;
    const whitelisted = addon.config.whitelistRegexp().some(re => {
      return re.test(host);
    });
    if (!whitelisted) {
      return sendError(
        `Host at ${baseUrl} is not authorized to register as the host does not match the ` +
          `registration whitelist (${addon.config.whitelist()}).`
      );
    }

    const clientKey = regInfo.clientKey;
    if (!clientKey) {
      sendError(`No client key provided for host at ${baseUrl}.`);
      return;
    }

    // Safe fallback to legacy authentication using sharedSecret if header was not signed with asymmetric algorithm.
    if (addon.config.signedInstall() && isJWTAsymmetric(addon, req)) {
      addon.authenticateInstall()(req, res, () => {
        if (
          /no-auth/.test(process.env.AC_OPTS) ||
          req.context.clientKey === regInfo.clientKey
        ) {
          next();
        } else {
          sendError(
            "clientKey in install payload did not match authenticated client"
          );
        }
      });
    } else {
      // If singedInstall is disabled, fallback to legacy authentication using sharedSecret
      const localParam = {};
      if (addon.config.signedInstall()) {
        localParam.unexpectedInstallHook = true;
      }

      addon.settings.get("clientInfo", clientKey).then(
        settings => {
          if (settings) {
            addon.logger.info(
              `Found existing settings for client ${clientKey}. Authenticating reinstall request`
            );
            addon.authenticate()(req, res, () => {
              if (req.context.clientKey === clientKey) {
                res.locals = _.extend(res.locals || {}, localParam);
                next();
              } else {
                sendError(
                  "clientKey in install payload did not match authenticated client"
                );
              }
            });
          } else {
            res.locals = _.extend(res.locals || {}, localParam);
            next();
          }
        },
        err => {
          sendError(err.message);
        }
      );
    }
  };
}

function isJWTAsymmetric(addon, req) {
  const token = utils.extractJwtFromRequest(addon, req);

  if (!token) {
    return false;
  }

  return jwt.AsymmetricAlgorithm.RS256 === jwt.getAlgorithm(token);
}

function getKey(keyId) {
  const cdnUrl = `${
    process.env.CONNECT_KEYS_CDN_URL || CONNECT_INSTALL_KEYS_CDN_URL
  }/${keyId}`;

  return new Promise((resolve, reject) => {
    request.get(cdnUrl, (_err, response) => {
      if (_err || !response || !response.body) {
        return reject({
          code: 404,
          message: `Could not get public key with keyId ${keyId}`,
          ctx: {}
        });
      } else {
        return resolve(response.body);
      }
    });
  });
}

async function decodeAsymmetricToken(token, noVerify) {
  const publicKey = await getKey(jwt.getKeyId(token));
  return jwt.decodeAsymmetric(
    token,
    publicKey,
    jwt.AsymmetricAlgorithm.RS256,
    noVerify
  );
}

async function verifyAsymmetricJwtAndGetClaims(addon, req) {
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
    unverifiedClaims = await decodeAsymmetricToken(token, true);
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

  if (
    _.isEmpty(unverifiedClaims.aud) ||
    !unverifiedClaims.aud[0] ||
    unverifiedClaims.aud[0].replace(/\/$/, "") !==
      addon.config.localBaseUrl().replace(/\/$/, "")
  ) {
    // audience should match the addon baseUrl defined in the descriptor
    return Promise.reject({
      code: 401,
      message: "JWT claim did not contain the correct audience (iss) claim",
      ctx: {}
    });
  }

  const queryStringHash = unverifiedClaims.qsh;
  if (!queryStringHash) {
    // session JWT tokens don't require a qsh
    return Promise.reject({
      code: 401,
      message: "JWT claim did not contain the query string hash (qsh) claim",
      ctx: {}
    });
  }

  const request = req;
  const clientKey = issuer;
  let verifiedClaims;
  try {
    verifiedClaims = await decodeAsymmetricToken(token, false);
  } catch (error) {
    return Promise.reject({
      code: 400,
      message: `Unable to decode JWT token: ${error}`,
      ctx: {}
    });
  }

  const expiry = verifiedClaims.exp;

  if (expiry && moment().utc().unix() >= expiry) {
    return Promise.reject({
      code: 401,
      message: "Authentication request has expired. Try reloading the page.",
      ctx: {}
    });
  }

  if (!utils.validateQshFromRequest(verifiedClaims, request, addon)) {
    return Promise.reject({
      code: 401,
      message: "Authentication failed: query hash does not match.",
      ctx: {}
    });
  }

  return {
    clientKey,
    key: addon.key
  };
}

function authenticateInstall(addon) {
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

    verifyAsymmetricJwtAndGetClaims(addon, req)
      .then(verifiedParams => {
        req.context = verifiedParams || {};
        next();
      })
      .catch(error => {
        sendError(error);
      });
  };
}

module.exports = {
  verify,
  authenticateInstall
};
