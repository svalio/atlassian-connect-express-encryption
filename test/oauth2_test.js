var OAuth2 = require('../lib/internal/oauth2');
var mocks = require('./mocks');
var RSVP = require('rsvp');
var md5 = require('md5');
var moment = require('moment');
var should = require('should');
var _ = require('lodash');

describe('OAuth2', function () {
    var clientSettings = {
        clientKey: 'test-client-key',
        sharedSecret: 'shared-secret',
        baseUrl: 'https://test.atlassian.net'
    };

    var mockAddon = function () {
        return {
            key: "test-addon-key",
            descriptor: {
                scopes: ['READ', 'WRITE']
            },
            logger: require('./logger'),
            settings: mocks.store(clientSettings, clientSettings.clientKey)
        }
    };

    describe('#getUserBearerToken', function () {

        it('calls OAuth service', function (done) {
            var authServiceMock = mocks.oauth2.service();

            var addon = mockAddon();
            new OAuth2(addon).getUserBearerToken('BruceWayne', addon.descriptor.scopes, clientSettings).then(function (token) {
                authServiceMock.done();
                should.ok(token);
                done();
            });
        });

        it('calls dev OAuth service for jira-dev instances', function (done) {
            var authServiceMock = mocks.oauth2.service(null, 'https://auth.dev.atlassian.io');
            var addon = mockAddon();

            var settings = _.extend({}, clientSettings, { baseUrl: 'https://test.jira-dev.com' });
            new OAuth2(addon).getUserBearerToken('BruceWayne', addon.descriptor.scopes, settings).then(function (token) {
                authServiceMock.done();
                should.ok(token);
                done();
            });
        });

        it('stores token in cache', function (done) {
            var authServiceMock = mocks.oauth2.service();

            var addon = mockAddon();
            var oauth2 = new OAuth2(addon);
            oauth2.getUserBearerToken('BruceWayne', addon.descriptor.scopes, clientSettings).then(function (token) {
                authServiceMock.done();

                var cacheKey = oauth2._createTokenCacheKey('BruceWayne', addon.descriptor.scopes);
                addon.settings.get(cacheKey, clientSettings.clientKey).then(function (cachedToken) {
                    cachedToken.token.should.eql(mocks.oauth2.ACCESS_TOKEN);
                    done();
                }, function (err) {
                    should.fail(err);
                    done();
                });
            });
        });

        it('retrieves token from cache', function (done) {
            var authServiceMock = mocks.oauth2.service();

            var addon = mockAddon();
            var oauth2 = new OAuth2(addon);

            var cachedToken = {
                expiresAt: moment().add(5, 'minutes').unix(),
                token: {
                    access_token: 'cached',
                    expires_in: 500,
                    token_type: 'Bearless'
                }
            };

            var cacheKey = oauth2._createTokenCacheKey('BruceWayne', addon.descriptor.scopes);
            addon.settings.set(cacheKey, cachedToken, clientSettings.clientKey)
                .then(
                    function () {
                        oauth2.getUserBearerToken('BruceWayne', addon.descriptor.scopes, clientSettings).then(function (token) {
                            // should not have called out to external service
                            authServiceMock.isDone().should.be.false();

                            token.should.eql(cachedToken.token);
                            done();
                        });
                    }, function (err) {
                        should.fail(err);
                        done();
                    }
                );
        });

        it('bypasses token cache if expired', function (done) {
            var authServiceMock = mocks.oauth2.service();

            var addon = mockAddon();
            var oauth2 = new OAuth2(addon);


            var cachedToken = {
                expiresAt: moment().subtract(5, 'minutes').unix(),
                token: {
                    access_token: 'cached',
                    expires_in: 500,
                    token_type: 'Bearless'
                }
            };

            var cacheKey = oauth2._createTokenCacheKey('BruceWayne', addon.descriptor.scopes);
            addon.settings.set(cacheKey, cachedToken, clientSettings.clientKey)
                .then(
                    function () {
                        oauth2.getUserBearerToken('BruceWayne', addon.descriptor.scopes, clientSettings).then(function (token) {
                            token.should.eql(mocks.oauth2.ACCESS_TOKEN);
                            done();
                        });
                    }, function (err) {
                        should.fail(err);
                        done();
                    }
                );
        });
    });

    describe('#_createTokenCacheKey', function () {
        it('Token cache key is created with no scopes', function (done) {
            var oauth2 = new OAuth2(mockAddon());

            should.exist(oauth2._createTokenCacheKey('barney', null));
            done();
        });

        it('Token cache key is the same for falsey inputs', function (done) {
            var oauth2 = new OAuth2(mockAddon());

            var key1 = oauth2._createTokenCacheKey('barney', []);
            var key2 = oauth2._createTokenCacheKey('barney', null);
            var key3 = oauth2._createTokenCacheKey('barney', undefined);
            var key4 = oauth2._createTokenCacheKey('barney', false);

            key2.should.be.equal(key1, 'Cache key should match');
            key3.should.be.equal(key1, 'Cache key should match');
            key4.should.be.equal(key1, 'Cache key should match');

            done();
        });

        it('Token cache key is the same for case differences', function (done) {
            var oauth2 = new OAuth2(mockAddon());

            var key1 = oauth2._createTokenCacheKey('barney', ['read']);
            var key2 = oauth2._createTokenCacheKey('barney', ['READ']);

            key2.should.be.equal(key1, 'Cache key should match');

            done();
        });

        it('Token cache key is the same for non-unique scopes', function (done) {
            var oauth2 = new OAuth2(mockAddon());

            var key1 = oauth2._createTokenCacheKey('barney', ['read']);
            var key2 = oauth2._createTokenCacheKey('barney', ['read', 'read']);
            var key3 = oauth2._createTokenCacheKey('barney', ['read', 'read', 'read']);

            key2.should.be.equal(key1, 'Cache key should match');
            key3.should.be.equal(key2, 'Cache key should match');

            done();
        });

        it('Token cache key is the same for scopes with order differences', function (done) {
            var oauth2 = new OAuth2(mockAddon());

            var key1 = oauth2._createTokenCacheKey('barney', ['read', 'write']);
            var key2 = oauth2._createTokenCacheKey('barney', ['write', 'read']);

            key2.should.be.equal(key1, 'Cache key should match');

            done();
        });

        it('Token cache key is the same for scopes with order differences and case differences', function (done) {
            var oauth2 = new OAuth2(mockAddon());

            var key1 = oauth2._createTokenCacheKey('barney', ['read', 'write']);
            var key2 = oauth2._createTokenCacheKey('barney', ['WRITE', 'read']);

            key2.should.be.equal(key1, 'Cache key should match');

            done();
        });

        it('Token cache key is the same for non-unique scopes with order differences and case differences', function (done) {
            var oauth2 = new OAuth2(mockAddon());

            var key1 = oauth2._createTokenCacheKey('barney', ['read', 'write']);
            var key2 = oauth2._createTokenCacheKey('barney', ['WRITE', 'read', 'write']);

            key2.should.be.equal(key1, 'Cache key should match');

            done();
        });
    });
});
