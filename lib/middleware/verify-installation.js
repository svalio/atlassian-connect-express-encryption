// Handles the lifecycle "installed" event of a connect addon.

const urls = require("url");
const moment = require("moment");
const jwt = require("atlassian-jwt");
const _ = require("lodash");
const request = require("request");
const requestHandler = require("./request");
const utils = require("../internal/utils");
const URI = require("urijs");

const CONNECT_INSTALL_KEYS_CDN_URL =
  "https://connect-install-keys.atlassian.com";
const CONNECT_INSTALL_KEYS_CDN_URL_STAGING =
  "https://cs-migrations--cdn.us-west-1.staging.public.atl-paas.net";

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

    addon.authenticateInstall()(req, res, next);
  };
}

function authenticateInstall(addon) {
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
    const clientKey = req.body.clientKey;

    // Unless `signed-install` was not set to `force`,
    // safely fallback to legacy authentication using sharedSecret if JWT header was not signed with `RS256`.
    const signedInstallFromDescriptor = _.get(
      addon.descriptor,
      "apiMigrations.signed-install",
      false
    );
    if (
      addon.config.signedInstall() === "force" ||
      (signedInstallFromDescriptor && isJWTAsymmetric(addon, req))
    ) {
      addon.authenticateAsymmetric()(req, res, () => {
        if (
          /no-auth/.test(process.env.AC_OPTS) ||
          req.context.clientKey === clientKey
        ) {
          next();
        } else {
          sendError(
            "clientKey in install payload did not match authenticated client"
          );
        }
      });
    } else {
      // If signedInstall is disabled, fallback to legacy authentication using sharedSecret
      const localParam = {};
      if (signedInstallFromDescriptor) {
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

function getKey(keyId, isStagingTenant) {
  const defaultKeyServerUrl = !isStagingTenant
    ? CONNECT_INSTALL_KEYS_CDN_URL
    : CONNECT_INSTALL_KEYS_CDN_URL_STAGING;
  const cdnUrl = `${
    process.env.CONNECT_KEYS_CDN_URL || defaultKeyServerUrl
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

async function decodeAsymmetricToken(token, noVerify, isStagingTenant) {
  const publicKey = await getKey(jwt.getKeyId(token), isStagingTenant);
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
  let isStagingTenant = false;
  const hostBaseUrl = _.get(req.body, "baseUrl");
  if (hostBaseUrl) {
    const host = new URI(hostBaseUrl).hostname();
    const hostEnvironment = host.substring(host.indexOf(".") + 1);
    if (hostEnvironment === "jira-dev.com") {
      isStagingTenant = true;
    }
  }

  try {
    unverifiedClaims = await decodeAsymmetricToken(
      token,
      true,
      isStagingTenant
    );
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

  const allowedBaseUrls = _.map(addon.config.allowedBaseUrls(), url =>
    url.replace(/\/$/, "")
  );
  if (
    _.isEmpty(unverifiedClaims.aud) ||
    !unverifiedClaims.aud[0] ||
    !_.includes(allowedBaseUrls, unverifiedClaims.aud[0].replace(/\/$/, ""))
  ) {
    // audience should match the addon baseUrl defined in the descriptor
    return Promise.reject({
      code: 401,
      message: "JWT claim did not contain the correct audience (aud) claim",
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
    verifiedClaims = await decodeAsymmetricToken(token, false, isStagingTenant);
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

  const verifiedParams = {
    clientKey,
    hostBaseUrl: _.get(settings, "baseUrl", hostBaseUrl),
    key: addon.key
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

function authenticateAsymmetric(addon) {
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
        const reqHandler = requestHandler(addon, verifiedParams || {});
        reqHandler(req, res, next);
      })
      .catch(error => {
        sendError(error);
      });
  };
}

module.exports = {
  verify,
  authenticateInstall,
  authenticateAsymmetric
};
