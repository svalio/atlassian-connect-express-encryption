var hostRequest = require("../internal/host-request");
var _ = require("underscore");

module.exports = function (plugin) {

  return function (req, res, next) {

    var hostDomain = req.param("xdm_e");
    var params;

    if (hostDomain) {
      params = {
        hostBaseUrl: hostDomain + (req.param("cp") || ""),
        userId: req.param("user_id"),
        license: req.param("lic"),
        timeZone: req.param("tz"),
        locale: req.param("loc")
      };
      _.extend(req.session, params);
    }
    else {
      params = req.session;
    }

    if (!params.userId && req.query.ctx_user_id) {
      params = _.extend({
        userId: req.query.ctx_user_id
      }, params);
    } 

    if (!params.hostBaseUrl && req.headers && req.headers.authorization) {
      // initial macro requests
      // parse appId from consumer key & lookup persisted settings
      // @todo refactor this further to leverage oauth auth header parsing
      var match = req.headers.authorization.match(/oauth_consumer_key="([^"]+)"/);
      if (match) {
        var consumerKey = decodeURIComponent(match[1]);
        plugin.settings.hget(consumerKey).then(function (appData) {
          if (appData && appData.baseUrl) {
            params = _.extend({
              hostBaseUrl: appData.baseUrl
            }, params);
            augmentRequest(params, req, res, next);
          }
        });
      }
    }
    else {
      // iframe and ajax requests made after rehydration from the session
      augmentRequest(params, req, res, next);
    }

  };

  function augmentRequest(params, req, res, next) {
    if (params && params.hostBaseUrl) {
      res.locals = _.extend({}, res.locals || {}, params, {
        title: plugin.name,
        appKey: plugin.key,
        localBaseUrl: plugin.config.localBaseUrl(),
        hostStylesheetUrl: hostResourceUrl(plugin.app, params.hostBaseUrl, "css"),
        hostScriptUrl: hostResourceUrl(plugin.app, params.hostBaseUrl, "js")
      });

      req.context = _.extend({
        http: hostRequest(req, plugin.config.privateKey())
      }, res.locals);
    }

    next();
  }

  function hostResourceUrl(app, baseUrl, type) {
    var suffix = app.get("env") === "development" ? "-debug" : "";
    return baseUrl + "/remotable-plugins/all" + suffix + "." + type;
  }

};
