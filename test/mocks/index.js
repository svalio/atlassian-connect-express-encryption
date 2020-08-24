const nock = require("nock");

module.exports = (function () {
  const OAUTH_ACCESS_TOKEN = {
    access_token: "{your access token}",
    expires_in: 900,
    token_type: "Bearer"
  };

  return {
    oauth2: {
      service(accessToken, url) {
        return nock(
          url || "https://oauth-2-authorization-server.services.atlassian.com"
        )
          .post("/oauth2/token")
          .reply(200, accessToken || OAUTH_ACCESS_TOKEN);
      },
      ACCESS_TOKEN: OAUTH_ACCESS_TOKEN
    },

    // eslint-disable-next-line no-unused-vars
    store(clientSettings, clientKey) {
      const _store = {};
      _store[clientSettings.clientKey] = {
        clientInfo: clientSettings // init clientInfo
      };

      return {
        get(key, clientKey) {
          const clientInfo = _store[clientKey];
          const val = clientInfo ? clientInfo[key] : null;
          return Promise.resolve(val);
        },
        set(key, val, clientKey) {
          const clientInfo = _store[clientKey] || {};
          clientInfo[key] = val;
          _store[clientKey] = clientInfo;
          return Promise.resolve(val);
        }
      };
    }
  };
})();
