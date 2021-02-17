const HostRequest = require("../internal/host-request");
const _ = require("lodash");

module.exports = function (addon, verifiedParameters) {
  const product = addon.config.product();

  function getHostScriptUrl() {
    const JIRACONF_ALL_CDN = "https://connect-cdn.atl-paas.net/all.js";
    const BB_ALL_CDN = "https://bitbucket.org/atlassian-connect/all.js";

    return product.isBitbucket ? BB_ALL_CDN : JIRACONF_ALL_CDN;
  }

  function hostResourceUrl(app, baseUrl, ext) {
    let resource = `all.${ext}`;
    if (app.get("env") === "development") {
      resource = `all-debug.${ext}`;
    }

    if (product.isBitbucket) {
      return `https://bitbucket.org/atlassian-connect/${resource}`;
    } else {
      return `${baseUrl}/atlassian-connect/${resource}`;
    }
  }

  function extractHost(uri) {
    const pathIndex = uri.indexOf("/");
    if (pathIndex > -1) {
      return uri.substring(0, pathIndex);
    }
    return uri;
  }

  // populate 'res.locals' which can be used in templates for variable substitution
  // If authenticated, the JWT data is authoritative, otherwise we use the URL params

  const requestHandler = function (req, res, next) {
    function getParam(key) {
      const value = req.query[key];
      if (value === undefined) {
        return (req.body || {})[key];
      }

      return value;
    }

    function getBaseUrlFromQueryParameters() {
      const hostUrl = getParam("xdm_e");
      return hostUrl ? hostUrl + (getParam("cp") || "") : "";
    }

    let httpClient = null;
    const params = {
      title: addon.name,
      addonKey: addon.key,
      clientKey: "", // only available for authenticated requests
      token: "", // only available for authenticated requests
      license: getParam("lic"),
      localBaseUrl: addon.config.localBaseUrl()
    };

    // Populate whatever data we have come through
    const timezone = getParam("tz");
    const locale = getParam("loc");
    const userId = getParam("user_id");
    // User Account ID not provided as part of context params

    if (timezone || locale || userId) {
      console.warn(
        "Please note that timezone, locale, userId and userKey context parameters are deprecated."
      );
      console.warn("See https://ecosystem.atlassian.net/browse/ACEJS-115");
    }

    // Deprecated, as per https://ecosystem.atlassian.net/browse/ACEJS-115
    if (timezone) {
      params.timezone = timezone;
    }
    if (locale) {
      params.locale = locale;
    }
    if (userId) {
      params.userId = userId;
    }

    if (product.isJIRA || product.isConfluence) {
      params.hostBaseUrl = getBaseUrlFromQueryParameters();
    }

    if (verifiedParameters) {
      // Likely due to a bug, we call it userId but its actually userKey.
      if (verifiedParameters.userKey) {
        params.userId = verifiedParameters.userKey;
      }
      if (verifiedParameters.addonKey) {
        params.addonKey = verifiedParameters.key;
      }

      params.userAccountId = verifiedParameters.userAccountId;
      params.clientKey = verifiedParameters.clientKey;
      params.hostBaseUrl = verifiedParameters.hostBaseUrl;
      params.token = verifiedParameters.token;

      if (verifiedParameters.context) {
        params.context = verifiedParameters.context;
      }

      httpClient = new HostRequest(addon, {}, verifiedParameters.clientKey);
    }

    // derived parameters
    if (product.isJIRA || product.isConfluence) {
      params.hostUrl = extractHost(params.hostBaseUrl);
      params.hostStylesheetUrl = hostResourceUrl(
        addon.app,
        params.hostBaseUrl,
        "css"
      );
    }
    params.hostScriptUrl = getHostScriptUrl();

    res.locals = _.extend({}, res.locals || {}, params);
    req.context = _.extend({ http: httpClient }, res.locals);

    next();
  };

  return requestHandler;
};
