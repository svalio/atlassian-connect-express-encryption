var hostRequest = require("../internal/host-request");
var _ = require("underscore");

module.exports = function (plugin) {

  return function (req, res, next) {

    var env = process.env;
    var hostDomain = req.param("xdm_e");
    var params;

    if (hostDomain) {
      params = {
        hostBaseUrl: env.AP3_HOST_BASE_URL || (hostDomain + (req.param("cp") || "")),
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

    res.locals = _.extend({}, res.locals || {}, params, {
      // @todo the plugin module name for the current url would be better here
      title: plugin.name,
      appKey: plugin.key,
      localBaseUrl: env.AP3_LOCAL_BASE_URL || req.protocol + "://" + req.header("host"),
      hostStylesheetUrl: hostResourceUrl(plugin.app, params.hostBaseUrl, "css"),
      hostScriptUrl: hostResourceUrl(plugin.app, params.hostBaseUrl, "js")
    });

    req.context = _.extend({
      http: hostRequest(req)
    }, res.locals);

    next();

  };

  function hostResourceUrl(app, baseUrl, type) {
    var suffix = app.settings.env === "development" ? "-debug" : "";
    return baseUrl + "/remotable-plugins/all" + suffix + "." + type;
  }

};
