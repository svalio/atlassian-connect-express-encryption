var helper = require('./test_helper');
var assert = require('assert');
var http = require('http');
var express = require('express');
var app = express();
var feebs = require('../index');
var addon = {};

describe('Descriptor', function(){
  var server = {};

  before(function(done){
    app.set('env','development');
    addon = feebs(app, {
      config: {
        key: 'my-test-app-key',
        name: 'My Test App Name',
        description: 'My test app description.',
        version: '1',
        vendorName: 'My Company',
        vendorUrl: 'http://example.com',
        permissions: ['create_oauth_link'],
        documentationUrl: 'http://example.com',
        development: {}
      }
    });
    server = http.createServer(app).listen(3001, done);
  });

  after(function(done){
    server.close();
    done();
  });

  it('should be parsed as an object', function(done){
    assert.equal(typeof addon.descriptor, 'object');
    done();
  });

  it('should have variables replaced from the addon config', function(done){
    assert.equal(addon.descriptor.key(), 'my-test-app-key');
    assert.equal(addon.descriptor.name(), 'My Test App Name');
    assert.equal(addon.descriptor.description(), 'My test app description.');
    assert.equal(addon.descriptor.version(), '1');
    assert.equal(addon.descriptor.vendorName(), 'My Company');
    assert.equal(addon.descriptor.vendorUrl(), 'http://example.com');
    assert.deepEqual(addon.descriptor.permissions(), ['create_oauth_link']);
    assert.equal(typeof addon.descriptor.documentationUrl(), 'string');
    assert.equal(addon.descriptor.documentationUrl(), 'http://example.com');
    assert.equal(typeof addon.descriptor.configureUrl(), 'string');
    assert.equal(addon.descriptor.configureUrl(), '/plugins/servlet/remotable-plugins/my-test-app-key/config-page');
    done();
  });

});
