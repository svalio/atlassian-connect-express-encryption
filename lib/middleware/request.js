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

  };

  function hostResourceUrl(app, baseUrl, type) {
    var suffix = app.get("env") === "development" ? "-debug" : "";
    return baseUrl + "/remotable-plugins/all" + suffix + "." + type;
  }

};
