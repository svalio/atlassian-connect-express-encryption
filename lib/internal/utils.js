const fs = require("fs");
const JSON5 = require("json5");
const _ = require("lodash");
const jwt = require("atlassian-jwt");
const packageVersion = require("../../package.json").version;

const JWT_PARAM = "jwt";
const TOKEN_KEY_PARAM = "acpt";
const TOKEN_KEY_HEADER = `X-${TOKEN_KEY_PARAM}`;

const AUTH_HEADER = "authorization"; // the header name appears as lower-case

const utils = {};

utils.unescapelf = function unescapelf(str) {
  return str ? str.replace(/\\n/g, "\n") : str;
};

utils.replaceAll = function replaceAll(settings, values) {
  Object.keys(settings).forEach(k => {
    const setting = settings[k];
    if (_.isString(setting)) {
      settings[k] = utils.replaceStr(setting, values);
    } else if (_.isObject(setting)) {
      utils.replaceAll(setting, values);
    }
  });
  return settings;
};

utils.replaceStr = function replaceStr(setting, values) {
  return setting.replace(/\$([a-zA-Z]\w*)/g, ($0, $1) => {
    return values[$1] || $0;
  });
};

utils.loadFile = function loadFile(path) {
  return fs.existsSync(path) ? fs.readFileSync(path).toString() : null;
};

utils.loadJSON = function loadConfig(path) {
  let data = {};
  try {
    data = utils.loadFile(path);
  } catch (e) {
    // do nothing
  }
  return data ? JSON5.parse(data) : {};
};

utils.replaceTokensInJson = function (obj, from, to) {
  for (const i in obj) {
    if (typeof obj[i] === "object") {
      obj[i] = utils.replaceTokensInJson(obj[i], from, to);
    } else {
      const re = new RegExp(from);
      if (re.test(obj[i])) {
        obj[i] = obj[i].replace(from, to);
      }
    }
  }
  return obj;
};

utils.merge = function (obj, override) {
  return _.merge(obj, override);
};

utils.packageVersion = function () {
  return packageVersion;
};

utils.checkNotNull = function (thing, name) {
  if (_.isNull(thing)) {
    throw new Error(`${name} must be defined`);
  }
};

utils.extractJwtFromRequest = function (addon, req) {
  const tokenInQuery = req.query[JWT_PARAM];

  // JWT is missing in query and we don't have a valid body.
  if (!tokenInQuery && !req.body) {
    addon.logger.warn(
      `Cannot find JWT token in query parameters. Please include body-parser middleware and parse the urlencoded body (See https://github.com/expressjs/body-parser) if the add-on is rendering in POST mode. Otherwise please ensure the ${JWT_PARAM} parameter is presented in query.`
    );
    return;
  }

  // JWT appears in both parameter and body will result query hash being invalid.
  const tokenInBody = req.body[JWT_PARAM];
  if (tokenInQuery && tokenInBody) {
    addon.logger.warn(
      "JWT token can only appear in either query parameter or request body."
    );
    return;
  }
  let token = tokenInQuery || tokenInBody;

  // if there was no token in the query-string then fall back to checking the Authorization header
  const authHeader = req.headers[AUTH_HEADER];
  if (authHeader && authHeader.indexOf("JWT ") === 0) {
    if (token) {
      const foundIn = tokenInQuery ? "query" : "request body";
      addon.logger.warn(
        `JWT token found in ${foundIn} and in header: using ${foundIn} value.`
      );
    } else {
      token = authHeader.substring(4);
    }
  }

  // TODO: Remove when we discontinue the old token middleware
  if (!token) {
    token = req.query[TOKEN_KEY_PARAM] || req.header(TOKEN_KEY_HEADER);
  }

  return token;
};

utils.validateQshFromRequest = function (
  verifiedClaims,
  request,
  addon,
  skipQshVerification = false
) {
  const jwtRequest = jwt.fromExpressRequest(request);
  if (!skipQshVerification && verifiedClaims.qsh) {
    let expectedHash = jwt.createQueryStringHash(
      jwtRequest,
      false,
      addon.config.baseUrl.href
    );
    let signatureHashVerified = verifiedClaims.qsh === expectedHash;
    if (!signatureHashVerified) {
      let canonicalRequest = jwt.createCanonicalRequest(
        jwtRequest,
        false,
        addon.config.baseUrl.href
      );

      // If that didn't verify, it might be a post/put - check the request body too
      expectedHash = jwt.createQueryStringHash(
        jwtRequest,
        true,
        addon.config.baseUrl.href
      );
      signatureHashVerified = verifiedClaims.qsh === expectedHash;
      if (!signatureHashVerified) {
        canonicalRequest = jwt.createCanonicalRequest(
          jwtRequest,
          true,
          addon.config.baseUrl.href
        );

        // Send the error message for the first verification - it's 90% more likely to be the one we want.
        addon.logger.error(
          `Auth failure: Query hash mismatch: Received: "${verifiedClaims.qsh}" but calculated "${expectedHash}". Canonical query was: "${canonicalRequest}`
        );
        return false;
      }
    }
  }
  return true;
};

module.exports = utils;
