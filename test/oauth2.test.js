const OAuth2 = require("../lib/internal/oauth2");
const mocks = require("./mocks");
const moment = require("moment");
const _ = require("lodash");

describe("OAuth2", () => {
  const clientSettings = {
    clientKey: "test-client-key",
    sharedSecret: "shared-secret",
    baseUrl: "https://test.atlassian.net"
  };

  const mockAddon = function () {
    return {
      key: "test-addon-key",
      descriptor: {
        scopes: ["READ", "WRITE"]
      },
      logger: require("./logger"),
      settings: mocks.store(clientSettings, clientSettings.clientKey)
    };
  };

  describe("#getUserBearerToken", () => {
    it("calls OAuth service", async () => {
      const authServiceMock = mocks.oauth2.service();

      const addon = mockAddon();
      const token = await new OAuth2(addon).getUserBearerToken(
        "BruceWayne",
        addon.descriptor.scopes,
        clientSettings
      );
      authServiceMock.done();
      expect(token).not.toBeUndefined();
    });

    it("calls OAuth service with accountId", async () => {
      const authServiceMock = mocks.oauth2.service();

      const addon = mockAddon();
      const token = await new OAuth2(addon).getUserBearerTokenByUserAccountId(
        "048abaf9-04ea-44d1-acb9-b37de6cc5d2f",
        addon.descriptor.scopes,
        clientSettings
      );
      authServiceMock.done();
      expect(token).not.toBeUndefined();
    });

    it("calls staging OAuth service for jira-dev instances", async () => {
      const authServiceMock = mocks.oauth2.service(
        null,
        "https://oauth-2-authorization-server.stg.services.atlassian.com"
      );
      const addon = mockAddon();

      const settings = _.extend({}, clientSettings, {
        baseUrl: "https://test.jira-dev.com"
      });
      const token = await new OAuth2(addon).getUserBearerToken(
        "BruceWayne",
        addon.descriptor.scopes,
        settings
      );
      authServiceMock.done();
      expect(token).not.toBeUndefined();
    });

    it("stores token in cache", async () => {
      const authServiceMock = mocks.oauth2.service();

      const addon = mockAddon();
      const oauth2 = new OAuth2(addon);
      await oauth2.getUserBearerToken(
        "BruceWayne",
        addon.descriptor.scopes,
        clientSettings
      );
      authServiceMock.done();

      const cacheKey = oauth2._createTokenCacheKey(
        "BruceWayne",
        addon.descriptor.scopes
      );
      const cachedToken = await addon.settings.get(
        cacheKey,
        clientSettings.clientKey
      );
      expect(cachedToken.token).toEqual(mocks.oauth2.ACCESS_TOKEN);
    });

    it("retrieves token from cache", async () => {
      const authServiceMock = mocks.oauth2.service();

      const addon = mockAddon();
      const oauth2 = new OAuth2(addon);

      const cachedToken = {
        expiresAt: moment().add(5, "minutes").unix(),
        token: {
          access_token: "cached",
          expires_in: 500,
          token_type: "Bearless"
        }
      };

      const cacheKey = oauth2._createTokenCacheKey(
        "BruceWayne",
        addon.descriptor.scopes
      );
      await addon.settings.set(cacheKey, cachedToken, clientSettings.clientKey);
      const token = await oauth2.getUserBearerToken(
        "BruceWayne",
        addon.descriptor.scopes,
        clientSettings
      );

      // should not have called out to external service
      expect(authServiceMock.isDone()).toBe(false);
      expect(token).toEqual(cachedToken.token);
    });

    it("bypasses token cache if expired", async () => {
      // eslint-disable-next-line no-unused-vars
      const authServiceMock = mocks.oauth2.service();

      const addon = mockAddon();
      const oauth2 = new OAuth2(addon);

      const cachedToken = {
        expiresAt: moment().subtract(5, "minutes").unix(),
        token: {
          access_token: "cached",
          expires_in: 500,
          token_type: "Bearless"
        }
      };

      const cacheKey = oauth2._createTokenCacheKey(
        "BruceWayne",
        addon.descriptor.scopes
      );
      await addon.settings.set(cacheKey, cachedToken, clientSettings.clientKey);
      const token = await oauth2.getUserBearerToken(
        "BruceWayne",
        addon.descriptor.scopes,
        clientSettings
      );

      expect(token).toEqual(mocks.oauth2.ACCESS_TOKEN);
    });
  });

  describe("#_createTokenCacheKey", () => {
    it("Token cache key is created with no scopes", () => {
      const oauth2 = new OAuth2(mockAddon());

      expect(oauth2._createTokenCacheKey("barney", null)).toBeDefined();
    });

    it("Token cache key is the same for falsey inputs", () => {
      const oauth2 = new OAuth2(mockAddon());

      const key1 = oauth2._createTokenCacheKey("barney", []);
      const key2 = oauth2._createTokenCacheKey("barney", null);
      const key3 = oauth2._createTokenCacheKey("barney", undefined);
      const key4 = oauth2._createTokenCacheKey("barney", false);

      expect(key2).toBe(key1);
      expect(key3).toBe(key1);
      expect(key4).toBe(key1);
    });

    it("Token cache key is the same for case differences", () => {
      const oauth2 = new OAuth2(mockAddon());

      const key1 = oauth2._createTokenCacheKey("barney", ["read"]);
      const key2 = oauth2._createTokenCacheKey("barney", ["READ"]);

      expect(key2).toBe(key1);
    });

    it("Token cache key is the same for non-unique scopes", () => {
      const oauth2 = new OAuth2(mockAddon());

      const key1 = oauth2._createTokenCacheKey("barney", ["read"]);
      const key2 = oauth2._createTokenCacheKey("barney", ["read", "read"]);
      const key3 = oauth2._createTokenCacheKey("barney", [
        "read",
        "read",
        "read"
      ]);

      expect(key2).toBe(key1);
      expect(key3).toBe(key2);
    });

    it("Token cache key is the same for scopes with order differences", () => {
      const oauth2 = new OAuth2(mockAddon());

      const key1 = oauth2._createTokenCacheKey("barney", ["read", "write"]);
      const key2 = oauth2._createTokenCacheKey("barney", ["write", "read"]);

      expect(key2).toBe(key1);
    });

    it("Token cache key is the same for scopes with order differences and case differences", () => {
      const oauth2 = new OAuth2(mockAddon());

      const key1 = oauth2._createTokenCacheKey("barney", ["read", "write"]);
      const key2 = oauth2._createTokenCacheKey("barney", ["WRITE", "read"]);

      expect(key2).toBe(key1);
    });

    it("Token cache key is the same for non-unique scopes with order differences and case differences", () => {
      const oauth2 = new OAuth2(mockAddon());

      const key1 = oauth2._createTokenCacheKey("barney", ["read", "write"]);
      const key2 = oauth2._createTokenCacheKey("barney", [
        "WRITE",
        "read",
        "write"
      ]);

      expect(key2).toBe(key1);
    });
  });
});
