var helper = require('./test_helper');
var should = require('should');
var http = require('http');
var express = require('express');
var app = express();
var ac = require('../index');
var request = require('request');
var moment = require('moment');
var jwt = require('atlassian-jwt');
var HostRequest = require('../lib/internal/host-request');
var logger = require('./logger');
var addon = {};

describe('Host Request', function () {
    var server;
    var httpClient;

    before(function (done) {
        app.set('env', 'development');
        app.use(express.urlencoded());
        app.use(express.json());

        // mock host
        app.get('/confluence/plugins/servlet/oauth/consumer-info', function (req, res) {
            res.set('Content-Type', 'application/xml');
            res.status(200).send(helper.consumerInfo);
        });

        app.head("/confluence/rest/plugins/1.0/", function (req, res) {
            res.setHeader("upm-token", "123");
            res.status(200).end();
        });

        app.get("/confluence/rest/plugins/1.0/", function(req, res) {
            res.json({plugins: []});
        });

        // Post request to UPM installer

        app.post("/confluence/rest/plugins/1.0/", function (req, res) {
            request({
                url: helper.addonBaseUrl + '/installed',
                query: {
                    jwt: createJwtToken()
                },
                method: 'POST',
                json: helper.installedPayload
            });
            res.status(200).end();
        });

        ac.store.register("teststore", function (logger, opts) {
            return require("../lib/store/jugglingdb")(logger, opts);
        });

        addon = ac(app, {
            config: {
                "development": {
                    store: {
                        adapter: 'teststore',
                        type: "memory"
                    },
                    "hosts": [
                        helper.productBaseUrl
                    ]
                }
            }
        }, logger);
        server = http.createServer(app).listen(helper.addonPort, function () {
            addon.register().then(done);
        });

        var settings = {
            'sharedSecret': helper.installedPayload.sharedSecret,
            'baseUrl': helper.productBaseUrl
        };
        addon.settings.set('clientInfo', settings, helper.installedPayload.clientKey);
        httpClient = new HostRequest(addon, { 'userKey': 'admin' }, helper.installedPayload.clientKey);
    });

    after(function (done) {
        setTimeout(function() {
            server.close();
            done();
        }, 50);
    });

    function createJwtToken() {
        var jwtPayload = {
            "sub": 'admin',
            "iss": helper.installedPayload.clientKey,
            "iat": moment().utc().unix(),
            "exp": moment().utc().add('minutes', 10).unix()
        };

        return jwt.encode(jwtPayload, helper.installedPayload.sharedSecret);
    }

    it('constructs non-null get request', function (done) {
        httpClient.get('/some/path/on/host').then(function(request) {
            request.should.be.ok();
            done();
        });
    });

    it('get request has headers', function (done) {
        httpClient.get('/some/path/on/host').then(function(request) {
            request.headers.should.be.ok();
            done();
        });
    });

    it('get request has user-agent header', function (done) {
        httpClient.get('/some/path/on/host').then(function(request) {
            request.headers['User-Agent'].should.startWith('atlassian-connect-express/');
            done();
        });
    });

    it('get request has user-agent version set to package version', function (done) {
        var aceVersion = require('../package.json').version;
        httpClient.get('/some/path/on/host').then(function(request) {
            request.headers['User-Agent'].should.eql('atlassian-connect-express/' + aceVersion);
            done();
        });
    });

    it('get request has Authorization header', function (done) {
        httpClient.get('/some/path/on/host').then(function(request) {
            request.headers['Authorization'].should.exist;
            done();
        });
    });

    it('get request has Authorization header starting with "JWT "', function (done) {
        httpClient.get('/some/path/on/host').then(function(request) {
            request.headers['Authorization'].should.startWith('JWT ');
            done();
        });
    });

    it('get request has correct JWT subject claim', function (done) {
        httpClient.get('/some/path/on/host').then(function(request) {
            var jwtToken = request.headers['Authorization'].slice(4);
            var decoded = jwt.decode(jwtToken, helper.installedPayload.clientKey, true);
            decoded.sub.should.eql('admin');
            done();
        });
    });

    it('get request has correct JWT qsh for encoded parameter', function (done) {
        httpClient.get('/some/path/on/host?q=~%20text').then(function(request) {
            var jwtToken = request.headers['Authorization'].slice(4);
            var decoded = jwt.decode(jwtToken, helper.installedPayload.clientKey, true);
            var expectedQsh = jwt.createQueryStringHash({
              'method': 'GET',
              'path'  : '/some/path/on/host',
              'query' : { 'q' : '~ text'}
            }, false, helper.productBaseUrl);
            decoded.qsh.should.eql(expectedQsh);
            done();
        });
    });

    it('get request for absolute url on host has Authorization header', function (done) {
        httpClient.get(helper.productBaseUrl + '/some/path/on/host').then(function(request) {
            request.headers['Authorization'].should.exist
            done();
        });
    });

    

    it('post request has correct url', function (done) {
        var relativeUrl = '/some/path/on/host';
        httpClient.post(relativeUrl).then(function(request) {
            request.uri.href.should.eql(helper.productBaseUrl + relativeUrl);
            done();
        });
    });

    it('post request preserves custom header', function (done) {
        httpClient.post({
            'url': '/some/path',
            'headers': {
                'custom_header': 'arbitrary value'
            }
        }).then(function(request) {
            request.headers['custom_header'].should.eql('arbitrary value');
            done();
        });
    });

    it('post request with form sets form data', function (done) {
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
        });
    });

    it('post requests using urlEncodedFormData have the right format', function (done) {
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
