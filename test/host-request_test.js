var helper = require('./test_helper');
var mocks = require('./mocks');
var config = require('../lib/internal/config');
var HostRequest = require('../lib/internal/host-request');
var nock = require('nock');
var should = require('should');
var shouldHttp = require('should-http');
var RSVP = require('rsvp');
var moment = require('moment');
var jwt = require('atlassian-jwt');
var extend = require('extend');

describe('Host Request', function () {
    var clientSettings = {
        clientKey: 'test-client-key',
        oauthClientId: 'oauth-client-id',
        sharedSecret: 'shared-secret',
        baseUrl: 'https://test.atlassian.net'
    };

    var createAddonConfig = function (opts) {
        opts = extend({
            jwt: {
                validityInMinutes: 3
            }
        }, opts);
        
        return config({}, "development", {
            "development": opts
        });
    };

    var mockAddon = function (addonConfig) {
        if (!addonConfig) {
            addonConfig = {};
        }

        return {
            logger: require('./logger'),
            key: "test-addon-key",
            config: createAddonConfig(addonConfig),
            descriptor: {
                scopes: ['READ', 'WRITE']
            },
            settings: mocks.store(clientSettings, clientSettings.clientKey)
        };
    };

    function getHttpClient(addonConfig, context) {
        if (arguments.length === 0) {
            addonConfig = context = {};
        } else if (arguments.length === 1) {
            context = addonConfig;
            addonConfig = {};
        }

        var a = mockAddon(addonConfig);
        return new HostRequest(a, context, clientSettings.clientKey);
    }

    function interceptRequest(testCallback, replyCallback, options) {
        var opts = extend({
            baseUrl: clientSettings.baseUrl,
            method: 'get',
            path: '/some/path/on/host',
            httpClientContext: {}
        }, options || {});

        if (!opts.requestPath) {
            opts.requestPath = opts.path;
        }

        var interceptor = nock(opts.baseUrl)
                            [opts.method](opts.path)
                            .reply(replyCallback);

        var httpClient = getHttpClient(opts.addonConfig, opts.httpClientContext);

        if (opts.httpClientWrapper) {
            httpClient = opts.httpClientWrapper(httpClient);
        }

        httpClient[opts.method](opts.requestPath, function() {
            interceptor.done(); // will throw assertion if endpoint is not intercepted
            testCallback();
        });
    }

    function interceptRequestAsUser(testCallback, replyCallback, options) {
        var userKey = options.userKey;
        delete options.userKey;
        var opts = extend({}, options, {
            httpClientWrapper: function (httpClient) {
                return httpClient.asUser(userKey);
            }
        });
        interceptRequest(testCallback, replyCallback, opts);
    }

    it('constructs non-null get request', function (done) {
        interceptRequest(done, 200);
    });

    describe('Headers', function () {
        it('get request has headers', function (done) {
            interceptRequest(done, function (uri, requestBody) {
                should.exist(this.req.headers);
            });
        });

        it('get request has user-agent header', function (done) {
            interceptRequest(done, function (uri, requestBody) {
                this.req.headers['user-agent'].should.startWith('atlassian-connect-express/');
            });
        });

        it('get request has user-agent version set to package version', function (done) {
            var aceVersion = require('../package.json').version;
            interceptRequest(done, function (uri, requestBody) {
                this.req.headers['user-agent'].should.startWith('atlassian-connect-express/' + aceVersion);
            });
        });

        it('post request preserves custom header', function (done) {
            var interceptor = nock(clientSettings.baseUrl)
                                .post('/some/path')
                                .reply(function (uri, requestBody) {
                                    this.req.headers.custom_header.should.eql('arbitrary value');
                                });

            getHttpClient().post({
                'url': '/some/path',
                'headers': {
                    'custom_header': 'arbitrary value'
                }
            }, function(request) {
                interceptor.done();
                done();
            });
        });
    });

    describe('Add-on JWT authentication', function () {
        it('get request has Authorization header', function (done) {
            interceptRequest(done, function (uri, requestBody) {
                should.exist(this.req.headers.authorization);
            });
        });

        it('bitbucket request sets sub claim as clientKey', function (done) {
            interceptRequest(done, function (uri, requestBody) {
                var jwtToken = this.req.headers.authorization.slice(4);
                var clientKey = clientSettings.clientKey;
                var decoded = jwt.decode(jwtToken, clientKey, true);
                decoded.sub.should.eql(clientKey);
            }, {
                addonConfig: {
                    product: 'bitbucket'
                }
            });
        });

        it('get request has Authorization header starting with "JWT "', function (done) {
            interceptRequest(done, function (uri, requestBody) {
                this.req.headers.authorization.should.startWith('JWT ');
            });
        });

        it('get request has correct JWT qsh for encoded parameter', function (done) {
            interceptRequest(done, function (uri, requestBody) {
                var jwtToken = this.req.headers.authorization.slice(4);
                var decoded = jwt.decode(jwtToken, clientSettings.clientKey, true);
                var expectedQsh = jwt.createQueryStringHash({
                  'method': 'GET',
                  'path'  : '/some/path/on/host',
                  'query' : { 'q' : '~ text'}
                }, false, helper.productBaseUrl);
                decoded.qsh.should.eql(expectedQsh);
            }, { path: '/some/path/on/host?q=~%20text'});
        });

        it('get request for absolute url on host has Authorization header', function (done) {
            interceptRequest(done, function (uri, requestBody) {
                this.req.headers.authorization.should.startWith('JWT ');
            }, { requestPath: 'https://test.atlassian.net/some/path/on/host' });
        });

        it('post request has correct url', function (done) {
            interceptRequest(done, function (uri, requestBody) {
                this.req.headers.authorization.should.startWith('JWT ');
            }, { method: 'post' });
        });
    });

    describe('User impersonation requests', function () {
        it('Request as user does not add JWT authorization header', function (done) {
            var authServiceMock = mocks.oauth2.service();
            interceptRequestAsUser(done, function (uri, requestBody) {
                authServiceMock.done();
                this.req.headers.authorization.should.not.startWith('JWT');
            }, { userKey: 'sruiz' });
        });

        it('Request as user adds a Bearer authorization header', function (done) {
            var authServiceMock = mocks.oauth2.service();
            interceptRequestAsUser(done, function (uri, requestBody) {
                authServiceMock.done();
                this.req.headers.authorization.should.startWith('Bearer');
            }, { userKey: 'sruiz' });
        });
    });

    describe('Form requests', function () {
        it('post request with form sets form data', function (done) {
            var interceptor = nock(clientSettings.baseUrl)
                        .post('/some/path')
                        .reply(200);


            getHttpClient().post({
                'url': '/some/path',
                file: [
                    'file content', {
                        filename: 'filename',
                        ContentType: 'text/plain'
                    }
                ]
            }).then(function(request) {
                request.file.should.eql(["file content", {"filename":"filename","ContentType":"text/plain"}]);
                done();
            });
        });


        it('post requests using multipartFormData have the right format', function (done) {
            var interceptor = nock(clientSettings.baseUrl)
                        .post('/some/path')
                        .reply(200);

            var someData = 'some data';
            getHttpClient().post({
                url: '/some/path',
                multipartFormData: {
                    file: [someData, { filename:'myattachmentagain.png' }]
                }
            }).then(function(request) {
                request._form.should.be.ok();
                request._form._valueLength.should.eql(someData.length);
                done();
            });
        });

        it('post requests using the deprecated form parameter still have the right format', function (done) {
            var interceptor = nock(clientSettings.baseUrl)
                        .post('/some/path')
                        .reply(200);

            var someData = 'some data';
            getHttpClient().post({
                url: '/some/path',
                form: {
                    file: [someData, { filename:'myattachmentagain.png' }]
                }
            }).then(function(request) {
                request._form.should.be.ok();
                request._form._valueLength.should.eql(someData.length);
                done();
            }, function (err) {
                console.log(err);
            });
        });

        it('post requests using urlEncodedFormData have the right format', function (done) {
            var interceptor = nock(clientSettings.baseUrl)
                        .post('/some/path')
                        .reply(200);

            getHttpClient().post({
                url: '/some/path',
                urlEncodedFormData: {
                    param1: 'value1'
                }
            }).then(function(request) {
                request.body.toString().should.eql('param1=value1');
                done();
            });
        });
    });
});
