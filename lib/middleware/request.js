var hostRequest = require("../internal/host-request");
var _ = require("underscore");

module.exports = function (plugin) {

  return function (req, res, next) {

    var env = process.env;
    var hostDomain = req.param("xdm_e");
    var locals;
    var context;

    if (hostDomain) {
      var hostBaseUrl = env.HOST_BASE_URL || (hostDomain + (req.param("cp") || ""));
      var userId = req.param("user_id");
      var license = req.param("lic");
      var timeZone = req.param("tz");
      var locale = req.param("loc");
      locals = {
        appKey: plugin.key,
        localBaseUrl: env.LOCAL_BASE_URL || req.protocol + "://" + req.header("host"),
        hostBaseUrl: hostBaseUrl,
        hostStylesheetUrl: hostResourceUrl(plugin.app, hostBaseUrl, "css"),
        hostScriptUrl: hostResourceUrl(plugin.app, hostBaseUrl, "js"),
        userId: userId,
        license: license,
        timeZone: timeZone,
        locale: locale
      };
      context = {
        http: hostRequest(req)
      };
    }

    res.locals = _.extend({}, locals || {}, res.locals);
    req.context = _.extend(context || {}, res.locals);

    next();

  }

  function hostResourceUrl(app, baseUrl, type) {
    var suffix = app.settings.env === "development" ? "-debug" : "";
    return baseUrl + "/remotable-plugins/all" + suffix + "." + type;
  }

};
