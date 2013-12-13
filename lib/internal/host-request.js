var httpClient = require('request');
var _ = require('underscore');
var moment = require('moment');
var urls = require('url');
var jwt = require('./jwt');

module.exports = function (addon, context, clientKey) {

    var createJwtPayload = function () {
        var now = moment().utc(),
                jwtTokenValidityInMinutes = addon.config.jwt().validityInMinutes;

        return {
//            "sub": userId,
            "iss": addon.key,
            "iat": now.unix(),
            "exp": now.add(jwtTokenValidityInMinutes, 'minutes').unix()
        };
    };

    var hostClient = function (options, callback) {
        return httpClient.apply(null, modifyArgs(options, callback));
    };

    ['get', 'post', 'put', 'del', 'patch'].forEach(function (method) {
        // hostClient.get -> return function
        // hostClient.get(options, callback) -> get client settings -> augment options -> callback
        hostClient[method] = function (options, callback) {
            addon.settings.get('clientInfo', clientKey).then(function (clientSettings) {


                var augmentHeaders = function (headers) {
                    var jwtPayload = createJwtPayload(),
                            jwtToken = jwt.encode(jwtPayload, clientSettings.sharedSecret, 'sha256');

                    headers['Authorization'] = "JWT " + jwtToken;
                };
//                var userId = context.userId;

                var args = modifyArgs(options, augmentHeaders, callback);

                return httpClient[method].apply(null, args);
            })
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

    function modifyArgs(options, augmentHeaders, callback) {
        var args = [];

        if (_.isString(options)) {
            options = {uri: options};
        }
        if (options.url) {
            options.uri = options.url;
            delete options.url;
        }

        var urlMod = modifyUrl(options.uri, hostBaseUrl); // todo wtfomgbbq
        options.uri = urlMod[0];
        var isHostUrl = urlMod[1];
        args.push(options);

        if (isHostUrl) {
            if (!options.headers) {
                options.headers = {};
            }

            if (augmentHeaders) {
                augmentHeaders(options.headers);
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
        if (url.indexOf('http:') !== 0 && url.indexOf('https:') !== 0) {
            url = urls.format(urls.parse(hostBaseUrl + url));
            isHostUrl = true;
        }
        return [url, isHostUrl];
    }

    return hostClient;
};
