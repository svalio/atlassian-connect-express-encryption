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
            clientKey: '', // only available for authenticated requests
            token: '', // only available for authenticated requests
            license: getParam('lic'),
            localBaseUrl: addon.config.localBaseUrl()
        };

        // Populate whatever data we have come through
        var timezone = getParam('tz');
        var locale = getParam('loc');
        var userId = getParam('user_id');
        // User Account ID not provided as part of context params

        if(timezone || locale || userId) {
            console.warn('Please note that timezone, locale, userId and userKey context parameters are deprecated.');
            console.warn('See https://ecosystem.atlassian.net/browse/ACEJS-115');
        }

        // Deprecated, as per https://ecosystem.atlassian.net/browse/ACEJS-115
        if(timezone) {
            params.timezone = timezone;
        }
        if(locale) {
            params.locale = locale;
        }
        if(userId) {
            params.userId = userId;
        }

        if (product.isJIRA || product.isConfluence) {
            params.hostBaseUrl = getBaseUrlFromQueryParameters();
        }

        if (verifiedParameters) {
            // Likely due to a bug, we call it userId but its actually userKey.
            if(verifiedParameters.userKey) {
                params.userId = verifiedParameters.userKey;
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
            params.hostStylesheetUrl = hostResourceUrl(addon.app, params.hostBaseUrl, 'css');
        }
        params.hostScriptUrl = hostResourceUrl(addon.app, params.hostBaseUrl, 'js');

        res.locals = _.extend({}, res.locals || {}, params);
        req.context = _.extend({ http: httpClient }, res.locals);

        next();
    };

  return requestHandler;
};