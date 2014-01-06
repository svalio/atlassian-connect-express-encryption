var httpClient = require('request');
var _ = require('underscore');
var moment = require('moment');
var urls = require('url');
var jwt = require('./jwt');
var Uri = require('jsuri');

function checkNotNull(thing, name) {
    if (_.isNull(thing)) {
        throw new Error(name + ' must be defined');
    }
}

module.exports = function (addon, context, clientKey) {

    checkNotNull(addon, 'addon');
    checkNotNull(addon.settings, 'addon.settings');

    var createJwtPayload = function (req, userId) {
        var now = moment().utc(),
                jwtTokenValidityInMinutes = addon.config.jwt().validityInMinutes;

        return {
            "sub": userId,
            "iss": addon.key,
            "iat": now.unix(),
            "exp": now.add(jwtTokenValidityInMinutes, 'minutes').unix(),
            "qsh": jwt.createQueryStringHash(req)
        };
    };

    var hostClient = function (options, callback) {
        return httpClient.apply(null, modifyArgs(options, callback));
    };

    ['get', 'post', 'put', 'del', 'patch'].forEach(function (method) {
        // hostClient.get -> return function
        // hostClient.get(options, callback) -> get client settings -> augment options -> callback
        hostClient[method] = function (options, callback) {
            return addon.settings.get('clientInfo', clientKey).then(function (clientSettings) {

                if (!clientSettings) {
                    return null;
                }

                var augmentHeaders = function (headers, relativeUri) {
                    var uri = new Uri(relativeUri);
                    var query = {};
                    for (var i in uri.queryPairs) {
                        var nameAndValue = uri.queryPairs[i];
                        var name = nameAndValue[0];
                        var value = nameAndValue[1];
                        query[name] = value;
                    }
                    var jwtPayload = createJwtPayload({
                                'method': method,
                                'path'  : uri.path(),
                                'query' : query
                            }, context ? context.userId : null),
                            jwtToken = jwt.encode(jwtPayload, clientSettings.sharedSecret, 'HS256');

                    headers['Authorization'] = "JWT " + jwtToken;
                };

                var args = modifyArgs(options, augmentHeaders, callback, clientSettings.baseUrl);

                var request = httpClient[method].apply(null, args);

                if (options.form) {
                    var form = request.form();

                    for (var key in options.form) {
                        var value = options.form[key];
                        if (_.isArray(value)) {
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

        var relativeUri = options.uri;
        var urlMod = modifyUrl(options.uri, hostBaseUrl);
        options.uri = urlMod[0];
        var isHostUrl = urlMod[1];
        args.push(options);

        if (isHostUrl) {
            if (!options.headers) {
                options.headers = {};
            }

            if (augmentHeaders) {
                augmentHeaders(options.headers, relativeUri);
            }

            options.jar = false;
            if (callback) {
                args.push(callback);
            }
        }

        return args;
    }

    function modifyUrl(url, hostBaseUrl) {
        var isHostUrl = false;
        var uri = new Uri(url);
        var protocol = uri.protocol();
        if (!protocol) {
            url = urls.format(urls.parse((hostBaseUrl ? hostBaseUrl : '') + url));
            isHostUrl = true;
        }
        return [url, isHostUrl];
    }

    return hostClient;
};
