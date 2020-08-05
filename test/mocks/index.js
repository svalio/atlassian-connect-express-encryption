const nock = require("nock");
const RSVP = require("rsvp");

module.exports = (function() {
  const OAUTH_ACCESS_TOKEN = {
    access_token: "{your access token}",
    expires_in: 900,
    token_type: "Bearer"
  };

  return {
    oauth2: {
      service: function(accessToken, url) {
        return nock(
          url || "https://oauth-2-authorization-server.services.atlassian.com"
        )
          .post("/oauth2/token")
          .reply(200, accessToken || OAUTH_ACCESS_TOKEN);
      },
      ACCESS_TOKEN: OAUTH_ACCESS_TOKEN
    },

    // eslint-disable-next-line no-unused-vars
    store: function(clientSettings, clientKey) {
      const _store = {};
      _store[clientSettings.clientKey] = {
        clientInfo: clientSettings // init clientInfo
      };

      return {
        get: function(key, clientKey) {
          const clientInfo = _store[clientKey];
          const val = clientInfo ? clientInfo[key] : null;
          return RSVP.Promise.resolve(val);
        },
        set: function(key, val, clientKey) {
          const clientInfo = _store[clientKey] || {};
          clientInfo[key] = val;
          _store[clientKey] = clientInfo;
          return RSVP.Promise.resolve(val);
        }
      };
    }
  };
})();
