var HostRequest = require('../internal/host-request');
var _ = require('lodash');

module.exports = function (addon, verifiedParameters) {

    var product = addon.config.product();

    function hostResourceUrl(app, baseUrl, ext) {
        var resource = 'all.' + ext;
        if (app.get('env') === 'development') {
            resource = 'all-debug.' + ext;
        }

        if (product.isBitbucket) {
            return 'https://bitbucket.org/atlassian-connect/' + resource;
        } else {
            return baseUrl + '/atlassian-connect/' + resource;
        }
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

    var requestHandler = function (req, res, next) {

        function getParam(key) {
            var value = req.query[key];
            if (value === undefined) {
                return (req.body || {})[key];
            }

            return value;
        }
        
        function getBaseUrlFromQueryParameters() {
            var hostUrl = getParam('xdm_e');
            return hostUrl ? hostUrl + (getParam('cp') || '') : '';
        }

        var httpClient = null;
        var params = {
            title: addon.name,
            addonKey: addon.key,
            userId : getParam('user_id'),
            clientKey: '', // only available for authenticated requests
            token: '', // only available for authenticated requests
            license: getParam('lic'),
            timeZone: getParam('tz'),
            locale: getParam('loc'),
            localBaseUrl: addon.config.localBaseUrl()
        };

        if (product.isJIRA || product.isConfluence) {
            params.hostBaseUrl = getBaseUrlFromQueryParameters();
        }

        if (verifiedParameters) {
            params.userId = verifiedParameters.userId;
            params.clientKey = verifiedParameters.clientKey;
            params.hostBaseUrl = verifiedParameters.hostBaseUrl;
            params.token = verifiedParameters.token;

            httpClient = new HostRequest(addon, verifiedParameters.userId, verifiedParameters.clientKey);
        }

        // derived parameters
        if (product.isJIRA || product.isConfluence) {
            params.hostUrl = extractHost(params.hostBaseUrl);
            params.hostStylesheetUrl = hostResourceUrl(addon.app, params.hostBaseUrl, 'css');
        }
        params.hostScriptUrl = hostResourceUrl(addon.app, params.hostBaseUrl, 'js');

        res.locals = _.extend({}, res.locals || {}, params);
        req.context = _.extend({ http: httpClient }, res.locals);

        next();
    };

  return requestHandler;
};