var hostRequest = require("../internal/host-request");
var _ = require("underscore");
var urls = require("url");

module.exports = function (plugin) {

  return function (req, res, next) {

    // @todo this is all fucked and needs to be rewritten with a clear
    //       analysis of what's available in each type of request

    var hostUrl = req.param("xdm_e");
    var params;

    if (hostUrl) {
      params = {
        hostUrl: hostUrl,
        hostBaseUrl: hostUrl + (req.param("cp") || ""),
        license: req.param("lic"),
        timeZone: req.param("tz"),
        locale: req.param("loc"),
        clientKey: req.param("oauth_consumer_key")
      };
      _.extend(req.session, params);
    }
    else {
      params = req.session;
    }

    params.userId = req.param("user_id");
    copyCtxParams(req.headers, params, "ap-ctx-");
    copyCtxParams(req.params, params, "ctx_");

    if (!params.hostBaseUrl && req.headers && req.headers.authorization) {
      // initial macro requests
      // parse appId from consumer key & lookup persisted settings
      // @todo refactor this further to leverage oauth auth header parsing
      var match = req.headers.authorization.match(/oauth_consumer_key="([^"]+)"/);
      if (match) {
        params.clientKey = decodeURIComponent(match[1]);
        plugin.settings.hget(params.clientKey).then(
          function (appData) {
            params.hostBaseUrl = appData && appData.baseUrl;
            if (params.hostBaseUrl) {
              var url = urls.parse(params.hostBaseUrl);
              url.pathname = "";
              params.hostUrl = urls.format(url);
            }
            augmentRequest(params, req, res, next);
          },
          function () {
            plugin.logger.error.apply(plugin.logger, arguments);
            augmentRequest(params, req, res, next);
          }
        );
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

};

function hostResourceUrl(app, baseUrl, type) {
  var suffix = app.get("env") === "development" ? "-debug" : "";
  return baseUrl + "/remotable-plugins/all" + suffix + "." + type;
}

function camelize(s) {
  return s.replace(/[\-_](\w)?/g, function ($0, $1) {
    return $1.toUpperCase();
  });
}

function copyCtxParams(from, to, prefix) {
  if (from && to) {
    _.keys(from).forEach(function (k) {
      if (k.indexOf(prefix) === 0) {
        to[camelize(k.slice(prefix.length))] = from[k];
      }
    });
  }
}
