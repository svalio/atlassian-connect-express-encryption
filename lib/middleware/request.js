var hostRequest = require('../internal/host-request');
var _ = require('lodash');

module.exports = function (addon) {

    function hostResourceUrl(app, baseUrl, type) {
        var suffix = app.get('env') === 'development' ? '-debug' : '';
        return baseUrl + '/atlassian-connect/all' + suffix + '.' + type;
    }

    function extractHost(uri) {
        var pathIndex = uri.indexOf('/');
        if (pathIndex > -1) {
            return uri.substring(0, pathIndex);
        }
        return uri;
    }

    // populate 'res.locals' which can be used in templates for variable substitution
    // If authenticated, the JWT data is authoritative, otherwise we use the URL params

    var requestHandler = function (req, res, next, verifiedParameters) {

        function getBaseUrlFromQueryParameters() {
            var hostUrl = req.query['xdm_e'];
            return hostUrl ? hostUrl + (req.query['cp'] || '') : "";
        }

        var hostBaseUrl = getBaseUrlFromQueryParameters();

        var params = {
            title: addon.name,
            appKey: addon.key,
            userId : req.query['user_id'],
            clientKey: "", // only available for authenticated requests
            token: "", // only available for authenticated requests
            hostUrl : extractHost(hostBaseUrl),
            hostBaseUrl: hostBaseUrl,
            license: req.query['lic'],
            timeZone: req.query['tz'],
            locale: req.query['loc'],
            localBaseUrl: addon.config.localBaseUrl(),
            hostStylesheetUrl: hostResourceUrl(addon.app, hostBaseUrl, 'css'),
            hostScriptUrl: hostResourceUrl(addon.app, hostBaseUrl, 'js')
        };

        if (verifiedParameters) {
            params.userId = verifiedParameters.userId;
            params.clientKey = verifiedParameters.clientKey;
            params.hostUrl = extractHost(verifiedParameters.hostBaseUrl);
            params.hostBaseUrl = verifiedParameters.hostBaseUrl;
            params.token = verifiedParameters.token;

            var httpClient = hostRequest(addon, verifiedParameters.userId, verifiedParameters.clientKey);
        }

        res.locals = _.extend({}, res.locals || {}, params);
        req.context = _.extend({ http: httpClient }, res.locals);

        next();
    };

  return requestHandler;
};