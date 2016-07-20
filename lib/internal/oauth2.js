var oauth2 = require('atlassian-oauth2');
var moment = require('moment');
var md5 = require('md5');
var RSVP = require('rsvp');
var utils = require('./utils');

function OAuth2 (addon) {
    this.addon = addon;
}

/**
 * Creates a data store index key for storing the access token in a cache
 *
 * @param {String} userKey - The userKey to create a cache key for
 * @returns {String} A key which identifies the user's token in the data store
 */
OAuth2.prototype._createTokenCacheKey = function (userKey) {
    return "bearer-" + md5(userKey); // no need to store personal information in the database. Hash it.
}

/**
 * Looks up a cached bearer token for a given user in the data store
 *
 * @param {String} userKey - The userKey
 * @param {String} clientSettings - Settings object for the current tenant
 * @returns {Promise} A promise that returns the access token if resolved, or an error if rejected
 */
OAuth2.prototype._getCachedBearerToken = function (userKey, clientSettings) {
    utils.checkNotNull(clientSettings);
    utils.checkNotNull(clientSettings.clientKey);

    var key = this._createTokenCacheKey(userKey);

    return this.addon.settings.get(key, clientSettings.clientKey);
}

/**
 * Stores the user bearer token in a cache
 *
 * @param {String} userKey - The userKey
 * @param {String} bearerToken - The token to cache
 * @param {String} expiresAt - The time when the token expires
* @param {String} clientSettings - Settings object for the current tenant
 * @returns {Promise} A promise that is resolved when the key is stored
 */
OAuth2.prototype._cacheUserBearerToken = function (userKey, bearerToken, expiresAt, clientSettings) {
    utils.checkNotNull(clientSettings);
    utils.checkNotNull(clientSettings.clientKey);

    var key = this._createTokenCacheKey(userKey);
    var token = {
        token: bearerToken,
        expiresAt: expiresAt
    }
    
    return this.addon.settings.set(key, token, clientSettings.clientKey);
}

/**
 * Retrieves a bearer token for a given user
 *
 * @param {String} userKey - The userKey
 * @param {String} clientSettings - Settings object for the current tenant
 * @returns {Promise} A promise that returns the access token if resolved, or an error if rejected
 */
OAuth2.prototype.getUserBearerToken = function (userKey, clientSettings) {
    utils.checkNotNull(clientSettings);

    var self = this;
    var opts = {
        hostBaseUrl: clientSettings.baseUrl,
        oauthClientId: clientSettings.oauthClientId,
        sharedSecret: clientSettings.sharedSecret,
        userKey: userKey,
        scopes: self.addon.descriptor.scopes
    };

    return this._getCachedBearerToken(userKey, clientSettings)
        .then(function (cachedToken) {
            // cut the expiry time by a few seconds for leeway
            var tokenExpiryTime = moment.unix(cachedToken.expiresAt).subtract(3, 'seconds');
            var isTokenExpired = tokenExpiryTime.isBefore(moment());
            if (cachedToken && !isTokenExpired) {
                return RSVP.Promise.resolve(cachedToken.token);
            }
            return RSVP.Promise.reject();
        })
        .then(function (token) {
            // resolved: we have a cached token
            return RSVP.Promise.resolve(token);
        }, function () {
            // rejected: no cached token - go retrieve one
            return new RSVP.Promise(function (resolve, reject) {
                var now = moment();
                oauth2.getAccessToken(opts).then(function (token) {
                    var tokenExpiry = now.add(token.expires_in, 'seconds').unix();
                    // cache the token
                    self._cacheUserBearerToken(userKey, token, tokenExpiry, clientSettings).then(function () {
                        resolve(token);
                    }, function (err) {
                        reject(err);
                    })
                    resolve(token);
                }, function (err) {
                    reject(err);
                });
            });
        });

    
};

module.exports = OAuth2;
