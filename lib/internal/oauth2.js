var oauth2 = require('atlassian-oauth2');
var _ = require('lodash');
var moment = require('moment');
var md5 = require('md5');
var RSVP = require('rsvp');
var URI = require('urijs');
var utils = require('./utils');

function OAuth2 (addon) {
    this.addon = addon;
}

/**
 * Creates a data store index key for storing the access token in a cache
 *
 * @param {String} userIdentifier - The userIdentifier to create a cache key for
 * @param {Array} scopes - Access token scopes
 * @returns {String} A key which identifies the user's token in the data store
 */
OAuth2.prototype._createTokenCacheKey = function (userIdentifier, scopes) {
    if (!scopes || !scopes.length) {
        scopes = [];
    }

    // Store the scopes in the cache key. Normalise scopes so that ['read', 'write'] has the same key as ['write', 'read']

    var uniqSortedScopes = _.uniq(_.map(scopes, function (s) {
        return s.toLowerCase();
    })).sort();

    var normalizedScopes = _.reduce(uniqSortedScopes, function (r, val) {
        return r += ("," + val.toLowerCase());
    }, '');

    return "bearer:" + md5(userIdentifier + normalizedScopes); // no need to store personal information in the database. Hash it.
};

/**
 * Looks up a cached bearer token for a given user in the data store
 *
 * @param {String} userIdentifier - The userIdentifier
 * @param {Array} scopes - Access token scopes
 * @param {String} clientSettings - Settings object for the current tenant
 * @returns {Promise} A promise that returns the access token if resolved, or an error if rejected
 */
OAuth2.prototype._getCachedBearerToken = function (userIdentifier, scopes, clientSettings) {
    utils.checkNotNull(userIdentifier, 'userIdentifier');
    utils.checkNotNull(scopes, 'scopes');
    utils.checkNotNull(clientSettings, 'clientSettings');
    utils.checkNotNull(clientSettings.clientKey, 'clientSettings.clientKey');

    var key = this._createTokenCacheKey(userIdentifier, scopes);

    return this.addon.settings.get(key, clientSettings.clientKey);
};

/**
 * Stores the user bearer token in a cache
 *
 * @param {String} userIdentifier - The userIdentifier
 * @param {Array} scopes - Access token scopes
 * @param {String} bearerToken - The token to cache
 * @param {String} expiresAt - The time when the token expires
 * @param {String} clientSettings - Settings object for the current tenant
 * @returns {Promise} A promise that is resolved when the key is stored
 */
OAuth2.prototype._cacheUserBearerToken = function (userIdentifier, scopes, bearerToken, expiresAt, clientSettings) {
    utils.checkNotNull(clientSettings);
    utils.checkNotNull(clientSettings.clientKey);

    var key = this._createTokenCacheKey(userIdentifier, scopes);
    var token = {
        token: bearerToken,
        expiresAt: expiresAt
    };

    return this.addon.settings.set(key, token, clientSettings.clientKey);
};

/**
 * Retrieves a bearer token for a given user by their Atlassian Account Id
 *
 * @param {String} userAccountId - The Atlassian Account Id of the user.
 * @param {Array} scopes - Access token scopes
 * @param {Object} clientSettings - Settings object for the current tenant
 * @returns {Promise} A promise that returns the access token if resolved, or an error if rejected
 */
OAuth2.prototype.getUserBearerTokenByUserAccountId = function(userAccountId, scopes, clientSettings) {
    utils.checkNotNull(userAccountId, 'userAccountId');
    var userKeyOrAAid = {};
    userKeyOrAAid.userAccountId = userAccountId;

    return this._getBearerToken(userKeyOrAAid, scopes, clientSettings);
}


/**
 * Retrieves a bearer token for a given user by their userKey
 *
 * @param {String} userKey - The userKey
 * @param {Array} scopes - Access token scopes
 * @param {Object} clientSettings - Settings object for the current tenant
 * @returns {Promise} A promise that returns the access token if resolved, or an error if rejected
 */
OAuth2.prototype.getUserBearerToken = function (userKey, scopes, clientSettings) {
    utils.checkNotNull(userKey, 'userKey');
    var userKeyOrAAid = {};
    userKeyOrAAid.userKey = userKey;

    return this._getBearerToken(userKeyOrAAid, scopes, clientSettings);
};

/**
 * Common base method for getting a user bearer token.
 * 
 * @param {String} userKeyOrAAid - either the userKey, or the AAID
 * @param {Array}} scopes - Access token scopes
 * @param {Object} clientSettings = Settings object for the currente tenant
 * @returns {Promise} A promise that returns the access token if resolved, or an error if rejected.
 */
OAuth2.prototype._getBearerToken = function (userKeyOrAAid, scopes, clientSettings) {
    utils.checkNotNull(clientSettings, 'clientSettings');

    var self = this;
    var opts = {
        hostBaseUrl: clientSettings.baseUrl,
        oauthClientId: clientSettings.oauthClientId,
        sharedSecret: clientSettings.sharedSecret,
    };
    // Need to support both accountId and userKey
    var userIdentifier;
    if(userKeyOrAAid.userAccountId) {
        opts.userAccountId = userKeyOrAAid.userAccountId;
        userIdentifier = userKeyOrAAid.userAccountId;
    } else if(userKeyOrAAid.userKey) {
        opts.userKey = userKeyOrAAid.userKey;
        userIdentifier = userKeyOrAAid.userKey;
    } else {
        throw new Error('Either the userKey or the userAccountId must be set');
    }

    var host = new URI(clientSettings.baseUrl).hostname();
    var hostEnvironment = host.substring(host.indexOf('.') + 1);
    if (hostEnvironment === 'jira-dev.com') {
        opts.authorizationServerBaseUrl = 'https://auth.dev.atlassian.io';
    }

    return this._getCachedBearerToken(userIdentifier, scopes, clientSettings)
        .then(function (cachedToken) {
            if (cachedToken) {
                // cut the expiry time by a few seconds for leeway
                var tokenExpiryTime = moment.unix(cachedToken.expiresAt).subtract(3, 'seconds');
                var isTokenExpired = tokenExpiryTime.isBefore(moment());
                if (!isTokenExpired) {
                    return RSVP.Promise.resolve(cachedToken.token);
                }
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
                    return self._cacheUserBearerToken(userIdentifier, scopes, token, tokenExpiry, clientSettings).then(function () {
                        resolve(token);
                    })
                }, function (err) {
                    reject(err);
                });
            });
        });
}


module.exports = OAuth2;
