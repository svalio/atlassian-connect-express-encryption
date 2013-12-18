var hostRequest = require('../internal/host-request');
var _ = require('underscore');
var urls = require('url');

module.exports = function (addon) {

    var requestHandler = function (req, res, next) {

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
                locale: req.param('loc')
            };
            _.extend(req.session, params);
        } else {
            params = req.session;
        }

        params.userId = req.param('user_id');
        copyCtxParams(req.headers, params, 'ap-ctx-');
        copyCtxParams(req.params, params, 'ctx_');
        copyCtxParams(req.query, params, 'ctx_');

        augmentRequest(params, req, res, next);
    };

    function augmentRequest(params, req, res, next) {
        if (params && params.hostBaseUrl) {
            res.locals = _.extend({}, res.locals || {}, params, {
                title: addon.name,
                appKey: addon.key,
                localBaseUrl: addon.config.localBaseUrl(),
                hostStylesheetUrl: hostResourceUrl(addon.app, params.hostBaseUrl, 'css'),
                hostScriptUrl: hostResourceUrl(addon.app, params.hostBaseUrl, 'js')
            });

            req.context = _.extend({
                http: hostRequest(res.locals, addon.config.privateKey(), params.clientSettings)
            }, res.locals);
        }

        next();
    }

  requestHandler.augmentRequest = augmentRequest;
  return requestHandler;
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
