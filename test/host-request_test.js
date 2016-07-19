var helper = require('./test_helper');
var nock = require('nock');
var should = require('should');
var shouldHttp = require('should-http');
var RSVP = require('rsvp');
var moment = require('moment');
var jwt = require('atlassian-jwt');
var extend = require('extend');
var HostRequest = require('../lib/internal/host-request');

describe('Host Request', function () {
    var httpClient;

    var addonKey = "test-addon-key";

    var clientSettings = {
        clientKey: 'test-client-key',
        sharedSecret: 'shared-secret',
        baseUrl: 'https://test.atlassian.net'
    }
    
    before(function (done) {
        
        var mockAddon = {
            logger: require('./logger'),
            key: addonKey,
            config: {
                jwt: function () {
                    return {
                        validityInMinutes: 3
                    }
                }
            },
            settings: {
                get: function () {
                    return new RSVP.Promise(function (resolve, reject) {
                        resolve(clientSettings);
                    });
                }
            }
        };

        var context = {
            'userKey': 'admin'
        };
        
        httpClient = new HostRequest(mockAddon, context, clientSettings.clientKey);
        
        done();
    });

    function createJwtToken() {
        var jwtPayload = {
            "sub": 'admin',
            "iss": clientSettings.clientKey,
            "iat": moment().utc().unix(),
            "exp": moment().utc().add('minutes', 10).unix()
        };

        return jwt.encode(jwtPayload, helper.installedPayload.sharedSecret);
    };

    function interceptRequest(testCallback, replyCallback, options) {
        var opts = extend({
            baseUrl: clientSettings.baseUrl,
            method: 'get',
            path: '/some/path/on/host'
        }, options || {});

        if (!opts.requestPath) {
            opts.requestPath = opts.path;
        }

        var interceptor = nock(opts.baseUrl)
                            [opts.method](opts.path)
                            .reply(replyCallback);

        httpClient[opts.method](opts.requestPath, function() {
            interceptor.done(); // will throw assertion if endpoint is not intercepted
            testCallback();
        });
    }

    it('constructs non-null get request', function (done) {
        interceptRequest(done, 200);
    });

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

    it('get request has Authorization header', function (done) {
        interceptRequest(done, function (uri, requestBody) {
            should.exist(this.req.headers['authorization']);
        });
    });

    it('get request has Authorization header starting with "JWT "', function (done) {
        interceptRequest(done, function (uri, requestBody) {
            this.req.headers['authorization'].should.startWith('JWT ');
        });
    });

    it('get request has correct JWT subject claim', function (done) {
        interceptRequest(done, function (uri, requestBody) {
            var jwtToken = this.req.headers['authorization'].slice(4);
            var decoded = jwt.decode(jwtToken, helper.installedPayload.clientKey, true);
            decoded.sub.should.eql('admin');
        });
    });

    it('get request has correct JWT qsh for encoded parameter', function (done) {
        interceptRequest(done, function (uri, requestBody) {
            var jwtToken = this.req.headers['authorization'].slice(4);
            var decoded = jwt.decode(jwtToken, helper.installedPayload.clientKey, true);
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
            this.req.headers['authorization'].should.startWith('JWT ');
        }, { requestPath: 'https://test.atlassian.net/some/path/on/host' });
    });

    it('post request has correct url', function (done) {
        interceptRequest(done, function (uri, requestBody) {
            this.req.headers['authorization'].should.startWith('JWT ');
        }, { method: 'post' });
    });

    it('post request preserves custom header', function (done) {
        var interceptor = nock(clientSettings.baseUrl)
                            .post('/some/path')
                            .reply(function (uri, requestBody) {
                                this.req.headers['custom_header'].should.eql('arbitrary value');
                            });

        httpClient.post({
            'url': '/some/path',
            'headers': {
                'custom_header': 'arbitrary value'
            }
        }, function(request) {
            interceptor.done();
            done();
        });
    });

    it('post request with form sets form data', function (done) {
        var interceptor = nock(clientSettings.baseUrl)
                    .post('/some/path')
                    .reply(200);


        httpClient.post({
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
        httpClient.post({
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
        httpClient.post({
            url: '/some/path',
            form: {
                file: [someData, { filename:'myattachmentagain.png' }]
            }
        }).then(function(request) {
            request._form.should.be.ok()
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

        httpClient.post({
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
