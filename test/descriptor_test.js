var helper = require('./test_helper');
var assert = require('assert');
var http = require('http');
var app = require('express')();
var ac = require('../index');
var logger = require('./logger');
var _ = require('lodash');
var addon = {};

describe('Descriptor', function () {
    var addon;
    var options = {
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
    };

    describe('With default configuration', function () {
        before(function (done) {
            app.set('env', 'development');
            addon = ac(app, options, logger);
            done();
        });

        it('should be parsed as an object', function (done) {
            assert.equal(typeof addon.descriptor, 'object');
            done();
        });

        it('should have variables replaced from the addon config', function (done) {
            var key = addon.descriptor.key;
            assert.equal(typeof key, 'string');
            assert.equal(key, 'my-test-app-key');
            var name = addon.descriptor.name;
            assert.equal(typeof name, 'string');
            assert.equal(name, 'My Test App Name');
            var description = addon.descriptor.description;
            assert.equal(typeof description, 'string');
            assert.equal(description, 'My test app description.');
            var version = addon.descriptor.version;
            assert.equal(typeof version, 'string');
            assert.equal(version, '1');
            var vendorName = addon.descriptor.vendor.name;
            assert.equal(typeof vendorName, 'string');
            assert.equal(vendorName, 'My Company');
            var vendorUrl = addon.descriptor.vendor.url;
            assert.equal(typeof vendorUrl, 'string');
            assert.equal(vendorUrl, 'http://example.com');
            done();
        });

        it('should list webhooks', function (done) {
            var webhooks = addon.descriptor.modules.webhooks;
            assert.equal(webhooks.length, 2);
            var enabled = webhooks[0];
            assert.equal(enabled.event, 'issue_created');
            assert.equal(enabled.url, '/issueCreated');
            var testHook = webhooks[1];
            assert.equal(testHook.event, 'plugin_test_hook');
            assert.equal(testHook.url, '/test-hook');
            webhooks = _.filter(addon.descriptor.modules.webhooks, {event: 'issue_created'});
            assert.equal(webhooks.length, 1);
            done();
        });

    });

    describe('With a configured descriptorTransformer', function () {
        var targetKey = "new-key";

        before(function (done) {
            app.set('env', 'development');
            var opts = options;
            opts.config.descriptorTransformer = function (descriptor) {
                descriptor.key = targetKey;
                return descriptor;
            };
            addon = ac(app, opts, logger);
            done();
        });

        it('should process the descriptorTransformer when generating the descriptor', function (done) {
            assert.equal(addon.descriptor.key, targetKey);
            done();
        });
    });
});
