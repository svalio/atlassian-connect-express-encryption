var httpClient = require('request');
var _ = require('lodash');
var moment = require('moment');
var jwt = require('atlassian-jwt');
var URI = require('urijs');
var utils = require('./utils');

function checkNotNull(thing, name) {
    if (_.isNull(thing)) {
        throw new Error(name + ' must be defined');
    }
}

module.exports = function (addon, context, clientKey) {

    checkNotNull(addon, 'addon');
    checkNotNull(addon.settings, 'addon.settings');
    context = context || {};

    var createJwtPayload = function (req, userKey) {
        var now = moment().utc(),
                jwtTokenValidityInMinutes = addon.config.jwt().validityInMinutes;

        var token = {
            "iss": addon.key,
            "iat": now.unix(),
            "exp": now.add(jwtTokenValidityInMinutes, 'minutes').unix(),
            "qsh": jwt.createQueryStringHash(req),
            "aud": [ clientKey ]
        };

        if (userKey) {
            token["sub"] = userKey;
        }
        return token;
    };

    var hostClient = function (options, callback) {
        return httpClient.apply(null, modifyArgs(options, callback));
    };

    ['get', 'post', 'put', 'del', 'head', 'patch'].forEach(function (method) {
        // hostClient.get -> return function
        // hostClient.get(options, callback) -> get client settings -> augment options -> callback
        hostClient[method] = function (options, callback) {
            return addon.settings.get('clientInfo', clientKey).then(function (clientSettings) {

                if (!clientSettings) {
                    addon.logger.warn('There are no "clientInfo" settings in the store for tenant "' + clientKey + '"');
                    return null;
                }

                var augmentHeaders = function (headers, relativeUri) {
                    var uri = new URI(relativeUri);
                    var query = uri.search(true);
                    var userKey = null;
                    if (context.userKey) {
                        userKey = context.userKey;
                    } else if (context.userId) {
                        addon.logger.warn("httpRequest userId is deprecated: please use the userKey attribute");
                        userKey = context.userId;
                    }

                    var httpMethod = method === 'del' ? 'delete' : method;

                    var jwtPayload = createJwtPayload({
                                'method': httpMethod,
                                'path'  : uri.path(),
                                'query' : query
                            }, userKey),
                            jwtToken = jwt.encode(jwtPayload, clientSettings.sharedSecret, 'HS256');

                    headers['Authorization'] = "JWT " + jwtToken;
                    headers['User-Agent'] = "atlassian-connect-express/" + utils.packageVersion();
                };

                var args = modifyArgs(options, augmentHeaders, callback, clientSettings.baseUrl);

                var multipartFormData = options.multipartFormData;
                delete options.multipartFormData;

                var request = httpClient[method].apply(null, args);

                if (multipartFormData) {
                    var form = request.form();

                    for (var key in multipartFormData) {
                        var value = multipartFormData[key];
                        if (Array.isArray(value)) {
                            form.append.apply(form, [key].concat(value));
                        }
                        else {
                            form.append.apply(form, [key, value]);
                        }
                    }
                }

                return request;
            });
        };
    });

    hostClient.defaults = function (options) {
        return httpClient.defaults.apply(null, modifyArgs(options));
    };

    hostClient.cookie = function () {
        return httpClient.cookie.apply(null, arguments);
    };

    hostClient.jar = function () {
        return httpClient.jar();
    };

    function modifyArgs(options, augmentHeaders, callback, hostBaseUrl) {
        var args = [];

        if (_.isString(options)) {
            options = {uri: options};
        }
        if (options.url) {
            options.uri = options.url;
            delete options.url;
        }
        if (options.form) {
            options.multipartFormData = options.form;
            delete options.form;
            addon.logger.warn("options.form is deprecated: please use options.multipartFormData");
        }
        if (options.urlEncodedFormData) {
            options.form = options.urlEncodedFormData;
            delete options.urlEncodedFormData;
        }

        var originalUri = options.uri;
        var targetUri = new URI(originalUri);
        var hostBaseUri = new URI(hostBaseUrl);

        if (!targetUri.origin()) {
            targetUri.origin(hostBaseUri.origin());
            var newPath = URI.joinPaths(hostBaseUri.path(), targetUri.path());
            targetUri.path(newPath.path());
        }

        options.uri = targetUri.toString();
        args.push(options);

        if (targetUri.origin() === hostBaseUri.origin()) {
            if (!options.headers) {
                options.headers = {};
            }

            if (augmentHeaders) {
                augmentHeaders(options.headers, originalUri);
            }

            options.jar = false;
        }

        if (callback) {
            args.push(callback);
        }

        return args;
    }

    return hostClient;
};
