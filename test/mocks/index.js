
var nock = require('nock');
var RSVP = require('rsvp');

module.exports = (function () {
    var OAUTH_ACCESS_TOKEN = {
        "access_token": "{your access token}",
        "expires_in": 900,
        "token_type": "Bearer"
    }

    return {
        oauth2: {
            service: function (accessToken, url) {
                return nock(url || 'https://auth.atlassian.io')
                        .post('/oauth2/token')
                        .reply(200, accessToken == null ? OAUTH_ACCESS_TOKEN : accessToken);
            },
            ACCESS_TOKEN: OAUTH_ACCESS_TOKEN
        },

        store: function (clientSettings, clientKey) {
            var _store = {};
            _store[clientSettings.clientKey] = {
                clientInfo: clientSettings // init clientInfo
            }

            return {
                get: function (key, clientKey) {
                    var clientInfo = _store[clientKey];
                    var val = clientInfo ? clientInfo[key] : null;
                    return RSVP.Promise.resolve(val);
                },
                set: function (key, val, clientKey) {
                    var clientInfo = _store[clientKey] || {};
                    clientInfo[key] = val;
                    _store[clientKey] = clientInfo;
                    return RSVP.Promise.resolve(val);
                }
            }
        }
    }

})();
