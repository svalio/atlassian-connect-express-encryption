var hostRequest = require('../internal/host-request');
var _ = require('underscore');
var urls = require('url')
var token = require('../internal/token');

module.exports = function (addon) {

  return function (req, res, next) {

    // @todo this is a mess and needs to be rewritten with a clear
    //       analysis of what's available in each type of request

    var hostUrl = req.param('xdm_e');
    var params;

    if (hostUrl) {
      params = {
        hostUrl: hostUrl,
        hostBaseUrl: hostUrl + (req.param('cp') || ''),
        license: req.param('lic'),
        timeZone: req.param('tz'),
        locale: req.param('loc'),
        clientKey: req.param('oauth_consumer_key')
      };
      _.extend(req.session, params);
    } else {
      params = req.session;
    }

    params.userId = req.param('user_id');
    copyCtxParams(req.headers, params, 'ap-ctx-');
    copyCtxParams(req.params, params, 'ctx_');
    copyCtxParams(req.query, params, 'ctx_');

    if (!params.hostBaseUrl && req.headers && req.headers.authorization) {
      // initial macro requests
      // parse appId from consumer key & lookup persisted settings
      // @todo refactor this further to leverage oauth auth header parsing
      var match = req.headers.authorization.match(/oauth_consumer_key="([^"]+)"/);
      if (match) {
        params.clientKey = decodeURIComponent(match[1]);
        addon.settings.get('clientInfo',params.clientKey).then(
          function (appData) {
            params.hostBaseUrl = appData && appData.baseUrl;
            if (params.hostBaseUrl) {
              var url = urls.parse(params.hostBaseUrl);
              url.pathname = '';
              params.hostUrl = urls.format(url);
            }
            augmentRequest(params, req, res, next);
          },
          function () {
            addon.logger.error.apply(addon.logger, arguments);
            augmentRequest(params, req, res, next);
          }
        );
      } else {
        // other pathways still need to continue through the middleware chain
        augmentRequest(params, req, res, next);
      }
    } else {
      // iframe and ajax requests made after rehydration from the session
      augmentRequest(params, req, res, next);
    }

  };

  function augmentRequest(params, req, res, next) {
    if (params && params.hostBaseUrl) {
      res.locals = _.extend({}, res.locals || {}, params, {
        title: addon.name,
        appKey: addon.key,
        token: createToken(params),
        localBaseUrl: addon.config.localBaseUrl(),
        hostStylesheetUrl: hostResourceUrl(addon.app, params.hostBaseUrl, 'css'),
        hostScriptUrl: hostResourceUrl(addon.app, params.hostBaseUrl, 'js')
      });

      req.context = _.extend({
        http: hostRequest(res.locals, addon.config.privateKey())
      }, res.locals);
    }

    next();
  }

  function createToken(params) {
    return token(addon.config.secret()).create(params.hostBaseUrl, params.userId, addon.config.allowTokenRefresh());
  }

};

function hostResourceUrl(app, baseUrl, type) {
  var suffix = app.get('env') === 'development' ? '-debug' : '';
  return baseUrl + '/atlassian-connect/all' + suffix + '.' + type;
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
