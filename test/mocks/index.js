
var nock = require('nock');

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
        }
    }

})();
