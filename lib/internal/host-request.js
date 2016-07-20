var request = require('request');
var _ = require('lodash');
var moment = require('moment');
var jwt = require('atlassian-jwt');
var URI = require('urijs');
var RSVP = require('rsvp');
var OAuth2 = require('./oauth2');
var utils = require('./utils');

function HostClient (addon, context, clientKey) {
    utils.checkNotNull(addon, 'addon');
    utils.checkNotNull(addon.settings, 'addon.settings');
    this.addon = addon;
    this.context = context || {};
    this.clientKey = clientKey;
    this.oauth2 = new OAuth2(addon);

    return this;
}

HostClient.prototype.defaults = function (options) {
    return request.defaults.apply(null, modifyArgs(options));
};

HostClient.prototype.cookie = function () {
    return request.cookie.apply(null, arguments);
};

HostClient.prototype.jar = function () {
    return request.jar();
};

/**
 * Make a request to the host product as the specific user. Will request and retrieve an access token if necessary
 *
 * @param userKey - the key referencing the remote user to impersonate when making the request
 * @returns the `hostClient` object suitable for chaining
 */
HostClient.prototype.asUser = function (userKey) {
    if (!userKey) {
        throw Error('A userKey must be provided to make a request as a user');
    }
    if (this.userKey) {
        throw Error('A userKey has already been provided to this httpClient');
    }
    this.userKey = userKey;
    return this;
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

        options.jar = false;
    }

    if (callback) {
        args.push(callback);
    }

    return args;
};

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

HostClient.prototype.getUserBearerToken = function (clientSettings) {
    utils.checkNotNull(clientSettings.baseUrl, 'clientSettings.baseUrl');
    utils.checkNotNull(clientSettings.oauthClientId, 'clientSettings.oauthClientId');
    utils.checkNotNull(clientSettings.sharedSecret, 'clientSettings.sharedSecret');
    utils.checkNotNull(this.userKey, 'userKey');

    // get new token
    return this.oauth2.getUserBearerToken(this.userKey, clientSettings);
};

['get', 'post', 'put', 'del', 'head', 'patch'].forEach(function (method) {
    // hostClient.get -> return function
    // hostClient.get(options, callback) -> get client settings -> augment options -> callback
    HostClient.prototype[method] = function (options, callback) {
        var self = this;

        return this.addon.settings.get('clientInfo', this.clientKey)
            .then(function (clientSettings) {
                if (!clientSettings) {
                    var message = 'There are no "clientInfo" settings in the store for tenant "' + clientKey + '"';
                    self.addon.logger.warn(message);
                    return RSVP.Promise.reject(message);
                }

                var response = {
                    clientSettings: clientSettings
                };
                if (self.userKey) {
                    return self.getUserBearerToken(clientSettings).then(function (token) {
                        response.bearerToken = token;
                        return RSVP.Promise.resolve(response);
                    });
                } else {
                    return RSVP.Promise.resolve(response);
                }
            })
            .then(function (response) {
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

                    if (!self.userKey) {
                        var jwtPayload = self.createJwtPayload({
                                'method': httpMethod,
                                'path'  : uri.path(),
                                'query' : query
                            }, userKey),
                            jwtToken = jwt.encode(jwtPayload, response.clientSettings.sharedSecret, 'HS256');

                        headers['Authorization'] = "JWT " + jwtToken;
                    } else {
                        headers['Authorization'] = "Bearer " + response.bearerToken;
                    }
                    headers['User-Agent'] = "atlassian-connect-express/" + utils.packageVersion();
                };

                var args = self.modifyArgs(options, augmentHeaders, callback, response.clientSettings.baseUrl);

                var multipartFormData = options.multipartFormData;
                delete options.multipartFormData;

                var _request = request[method].apply(null, args);

                if (multipartFormData) {
                    var form = _request.form();

                    _.forOwn(multipartFormData, function(value, key) {
                        if (Array.isArray(value)) {
                            form.append.apply(form, [key].concat(value));
                        }
                        else {
                            form.append.apply(form, [key, value]);
                        }
                    });
                }

                return _request;
            }, function (err) {
                console.log("error", err)
            });
    }
});


module.exports = HostClient;
