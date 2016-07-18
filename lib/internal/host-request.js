var request = require('request');
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

function HostClient (addon, context, clientKey) {
    checkNotNull(addon, 'addon');
    checkNotNull(addon.settings, 'addon.settings');
    this.addon = addon;
    this.context = context || {};
    this.clientKey = clientKey;

    return this;
}

HostClient.prototype.httpClient = function (options, callback) {
    return request.apply(null, this.modifyArgs(options, callback));
};

HostClient.prototype.defaults = function (options) {
    return request.defaults.apply(null, modifyArgs(options));
};

HostClient.prototype.cookie = function () {
    return request.cookie.apply(null, arguments);
};

HostClient.prototype.jar = function () {
    return request.jar();
};

HostClient.prototype.modifyArgs = function (options, augmentHeaders, callback, hostBaseUrl) {
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
        this.addon.logger.warn("options.form is deprecated: please use options.multipartFormData");
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

        // options.jar = false;
    }

    if (callback) {
        args.push(callback);
    }

    return args;
}

HostClient.prototype.createJwtPayload = function (req, userKey) {
    var now = moment().utc(),
            jwtTokenValidityInMinutes = this.addon.config.jwt().validityInMinutes;

    var token = {
        "iss": this.addon.key,
        "iat": now.unix(),
        "exp": now.add(jwtTokenValidityInMinutes, 'minutes').unix(),
        "qsh": jwt.createQueryStringHash(req),
        "aud": [ this.clientKey ]
    };

    if (userKey) {
        token["sub"] = userKey;
    }
    return token;
};



['get', 'post', 'put', 'del', 'head', 'patch'].forEach(function (method) {
    // hostClient.get -> return function
    // hostClient.get(options, callback) -> get client settings -> augment options -> callback
    HostClient.prototype[method] = function (options, callback) {
        var self = this;
        return this.addon.settings.get('clientInfo', this.clientKey).then(function (clientSettings) {

            if (!clientSettings) {
                self.addon.logger.warn('There are no "clientInfo" settings in the store for tenant "' + clientKey + '"');
                return null;
            }

            var augmentHeaders = function (headers, relativeUri) {
                var uri = new URI(relativeUri);
                var query = uri.search(true);
                var userKey = null;
                if (self.context.userKey) {
                    userKey = self.context.userKey;
                } else if (self.context.userId) {
                    self.addon.logger.warn("httpRequest userId is deprecated: please use the userKey attribute");
                    userKey = self.context.userId;
                }

                var httpMethod = method === 'del' ? 'delete' : method;

                var jwtPayload = self.createJwtPayload({
                            'method': httpMethod,
                            'path'  : uri.path(),
                            'query' : query
                        }, userKey),
                        jwtToken = jwt.encode(jwtPayload, clientSettings.sharedSecret, 'HS256');

                headers['Authorization'] = "JWT " + jwtToken;
                headers['User-Agent'] = "atlassian-connect-express/" + utils.packageVersion();
            };

            var args = self.modifyArgs(options, augmentHeaders, callback, clientSettings.baseUrl);

            var multipartFormData = options.multipartFormData;
            delete options.multipartFormData;

            var _request = request[method].apply(null, args);

            if (multipartFormData) {
                var form = _request.form();

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

            return _request;
        });
    };
});


module.exports = HostClient;
