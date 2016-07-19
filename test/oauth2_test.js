var OAuth2 = require('../lib/internal/oauth2'),
    mocks = require('./mocks')
    RSVP = require('rsvp'),
    md5 = require('md5'),
    moment = require('moment'),
    should = require('should');

describe('OAuth2', function () {
    var clientSettings = {
        clientKey: 'test-client-key',
        sharedSecret: 'shared-secret',
        baseUrl: 'https://test.atlassian.net'
    }

    var mockAddon = function () {
        var _store = {}
        return {
            key: "test-addon-key",
            descriptor: {
                scopes: ['READ', 'WRITE']
            },
            logger: require('./logger'),
            settings: {
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
    };

    describe('#getUserBearerToken', function () {

        it('calls OAuth service', function (done) {
            var authServiceMock = mocks.oauth2.service();

            var addon = mockAddon();
            new OAuth2(addon).getUserBearerToken('BruceWayne', clientSettings).then(function (token) {
                authServiceMock.done();
                should.ok(token);
                done();
            });
        });

        it('stores token in cache', function (done) {
            var authServiceMock = mocks.oauth2.service();

            var addon = mockAddon();
            var oauth2 = new OAuth2(addon);
            oauth2.getUserBearerToken('BruceWayne', clientSettings).then(function (token) {
                authServiceMock.done();
                
                var cacheKey = "bearer-" + md5('BruceWayne');
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

            var cacheKey = "bearer-" + md5('BruceWayne');
            addon.settings.set(cacheKey, cachedToken, clientSettings.clientKey)
                .then(
                    function () {
                        oauth2.getUserBearerToken('BruceWayne', clientSettings).then(function (token) {
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

            var cacheKey = "bearer-" + md5('BruceWayne');
            addon.settings.set(cacheKey, cachedToken, clientSettings.clientKey)
                .then(
                    function () {
                        oauth2.getUserBearerToken('BruceWayne', clientSettings).then(function (token) {
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
});
