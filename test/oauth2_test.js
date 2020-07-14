const OAuth2 = require("../lib/internal/oauth2");
const mocks = require("./mocks");
const moment = require("moment");
const should = require("should");
const _ = require("lodash");

describe("OAuth2", function() {
  const clientSettings = {
    clientKey: "test-client-key",
    sharedSecret: "shared-secret",
    baseUrl: "https://test.atlassian.net"
  };

  const mockAddon = function() {
    return {
      key: "test-addon-key",
      descriptor: {
        scopes: ["READ", "WRITE"]
      },
      // eslint-disable-next-line mocha/no-setup-in-describe
      logger: require("./logger"),
      // eslint-disable-next-line mocha/no-setup-in-describe
      settings: mocks.store(clientSettings, clientSettings.clientKey)
    };
  };

  describe("#getUserBearerToken", function() {
    it("calls OAuth service", function(done) {
      const authServiceMock = mocks.oauth2.service();

      const addon = mockAddon();
      new OAuth2(addon)
        .getUserBearerToken(
          "BruceWayne",
          addon.descriptor.scopes,
          clientSettings
        )
        .then(function(token) {
          authServiceMock.done();
          should.ok(token);
          done();
        });
    });

    it("calls OAuth service with accountId", function(done) {
      const authServiceMock = mocks.oauth2.service();

      const addon = mockAddon();
      new OAuth2(addon)
        .getUserBearerTokenByUserAccountId(
          "048abaf9-04ea-44d1-acb9-b37de6cc5d2f",
          addon.descriptor.scopes,
          clientSettings
        )
        .then(function(token) {
          authServiceMock.done();
          should.ok(token);
          done();
        });
    });

    it("calls staging OAuth service for jira-dev instances", function(done) {
      const authServiceMock = mocks.oauth2.service(
        null,
        "https://oauth-2-authorization-server.stg.services.atlassian.com"
      );
      const addon = mockAddon();

      const settings = _.extend({}, clientSettings, {
        baseUrl: "https://test.jira-dev.com"
      });
      new OAuth2(addon)
        .getUserBearerToken("BruceWayne", addon.descriptor.scopes, settings)
        .then(function(token) {
          authServiceMock.done();
          should.ok(token);
          done();
        });
    });

    it("stores token in cache", function(done) {
      const authServiceMock = mocks.oauth2.service();

      const addon = mockAddon();
      const oauth2 = new OAuth2(addon);
      // eslint-disable-next-line no-unused-vars
      oauth2
        .getUserBearerToken(
          "BruceWayne",
          addon.descriptor.scopes,
          clientSettings
        )
        .then(function() {
          authServiceMock.done();

          const cacheKey = oauth2._createTokenCacheKey(
            "BruceWayne",
            addon.descriptor.scopes
          );
          addon.settings.get(cacheKey, clientSettings.clientKey).then(
            function(cachedToken) {
              cachedToken.token.should.eql(mocks.oauth2.ACCESS_TOKEN);
              done();
            },
            function(err) {
              should.fail(err);
              done();
            }
          );
        });
    });

    it("retrieves token from cache", function(done) {
      const authServiceMock = mocks.oauth2.service();

      const addon = mockAddon();
      const oauth2 = new OAuth2(addon);

      const cachedToken = {
        expiresAt: moment()
          .add(5, "minutes")
          .unix(),
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
      addon.settings.set(cacheKey, cachedToken, clientSettings.clientKey).then(
        function() {
          oauth2
            .getUserBearerToken(
              "BruceWayne",
              addon.descriptor.scopes,
              clientSettings
            )
            .then(function(token) {
              // should not have called out to external service
              authServiceMock.isDone().should.be.false();

              token.should.eql(cachedToken.token);
              done();
            });
        },
        function(err) {
          should.fail(err);
          done();
        }
      );
    });

    it("bypasses token cache if expired", function(done) {
      // eslint-disable-next-line no-unused-vars
      const authServiceMock = mocks.oauth2.service();

      const addon = mockAddon();
      const oauth2 = new OAuth2(addon);

      const cachedToken = {
        expiresAt: moment()
          .subtract(5, "minutes")
          .unix(),
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
      addon.settings.set(cacheKey, cachedToken, clientSettings.clientKey).then(
        function() {
          oauth2
            .getUserBearerToken(
              "BruceWayne",
              addon.descriptor.scopes,
              clientSettings
            )
            .then(function(token) {
              token.should.eql(mocks.oauth2.ACCESS_TOKEN);
              done();
            });
        },
        function(err) {
          should.fail(err);
          done();
        }
      );
    });
  });

  describe("#_createTokenCacheKey", function() {
    it("Token cache key is created with no scopes", function(done) {
      const oauth2 = new OAuth2(mockAddon());

      should.exist(oauth2._createTokenCacheKey("barney", null));
      done();
    });

    it("Token cache key is the same for falsey inputs", function(done) {
      const oauth2 = new OAuth2(mockAddon());

      const key1 = oauth2._createTokenCacheKey("barney", []);
      const key2 = oauth2._createTokenCacheKey("barney", null);
      const key3 = oauth2._createTokenCacheKey("barney", undefined);
      const key4 = oauth2._createTokenCacheKey("barney", false);

      key2.should.be.equal(key1, "Cache key should match");
      key3.should.be.equal(key1, "Cache key should match");
      key4.should.be.equal(key1, "Cache key should match");

      done();
    });

    it("Token cache key is the same for case differences", function(done) {
      const oauth2 = new OAuth2(mockAddon());

      const key1 = oauth2._createTokenCacheKey("barney", ["read"]);
      const key2 = oauth2._createTokenCacheKey("barney", ["READ"]);

      key2.should.be.equal(key1, "Cache key should match");

      done();
    });

    it("Token cache key is the same for non-unique scopes", function(done) {
      const oauth2 = new OAuth2(mockAddon());

      const key1 = oauth2._createTokenCacheKey("barney", ["read"]);
      const key2 = oauth2._createTokenCacheKey("barney", ["read", "read"]);
      const key3 = oauth2._createTokenCacheKey("barney", [
        "read",
        "read",
        "read"
      ]);

      key2.should.be.equal(key1, "Cache key should match");
      key3.should.be.equal(key2, "Cache key should match");

      done();
    });

    it("Token cache key is the same for scopes with order differences", function(done) {
      const oauth2 = new OAuth2(mockAddon());

      const key1 = oauth2._createTokenCacheKey("barney", ["read", "write"]);
      const key2 = oauth2._createTokenCacheKey("barney", ["write", "read"]);

      key2.should.be.equal(key1, "Cache key should match");

      done();
    });

    it("Token cache key is the same for scopes with order differences and case differences", function(done) {
      const oauth2 = new OAuth2(mockAddon());

      const key1 = oauth2._createTokenCacheKey("barney", ["read", "write"]);
      const key2 = oauth2._createTokenCacheKey("barney", ["WRITE", "read"]);

      key2.should.be.equal(key1, "Cache key should match");

      done();
    });

    it("Token cache key is the same for non-unique scopes with order differences and case differences", function(done) {
      const oauth2 = new OAuth2(mockAddon());

      const key1 = oauth2._createTokenCacheKey("barney", ["read", "write"]);
      const key2 = oauth2._createTokenCacheKey("barney", [
        "WRITE",
        "read",
        "write"
      ]);

      key2.should.be.equal(key1, "Cache key should match");

      done();
    });
  });
});
