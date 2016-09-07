var helper = require('./test_helper');
var should = require('should');
var http = require('http');
var express = require('express');
var app = express();
var ac = require('../index');
var config = require('../lib/internal/config');
var logger = require('./logger');

describe('Configuration', function () {

    var createConfig = function (baseConfig, mode, overrides) {
        if (arguments.length === 0) {
            baseConfig = {};
            mode = "development";
            overrides = {};
        } else if (arguments.length === 1) {
            overrides = baseConfig;
            mode = "development";
            baseConfig = {};
        } else if (arguments.length === 2) {
            overrides = mode;
            mode = "development";
        }
        var opts = {};
        opts[mode] = overrides;
        return config(baseConfig, mode, opts);
    };

    it('should allow you to disable re-registration on plugin.xml change', function (done) {
        var config = createConfig({
            watch: false
        });
        config.watch().should.be.false();
        done();
    });

    it('should allow prefer env values over globals', function (done) {
        var config = createConfig({
            customShadowed: "global"
        }, {
                customShadowed: "env"
            });
        config.customShadowed().should.be.eql('env');
        done();
    });

    it('should allow access to custom global values', function (done) {
        var config = createConfig({
            customGlobal: "global"
        }, {});
        config.customGlobal().should.be.eql('global');
        done();
    });

    it('should allow access to custom env-specific values', function (done) {
        var config = createConfig({
            customEnv: "bar"
        });
        config.customEnv().should.be.eql('bar');
        done();
    });

    describe('Product', function () {
        it('should default to jira', function (done) {
            var config = createConfig();
            config.product().id.should.be.eql('jira');
            done();
        });

        it('should read type jira from config', function (done) {
            var config = createConfig({
                product: 'jira'
            });
            config.product().id.should.be.eql('jira');
            config.product().isJIRA.should.be.true();
            config.product().isConfluence.should.be.false();
            config.product().isBitbucket.should.be.false();
            done();
        });

        it('should read type confluence from config', function (done) {
            var config = createConfig({
                product: 'confluence'
            });
            config.product().id.should.be.eql('confluence');
            config.product().isJIRA.should.be.false();
            config.product().isConfluence.should.be.true();
            config.product().isBitbucket.should.be.false();

            done();
        });

        it('should read type confluence from global config', function (done) {
            var config = createConfig({
                product: 'confluence'
            }, "development", {
                notProduct: 'boring'
            });
            config.product().id.should.be.eql('confluence');
            config.product().isJIRA.should.be.false();
            config.product().isConfluence.should.be.true();
            config.product().isBitbucket.should.be.false();

            done();
        });

        it('should read type bitbucket from config', function (done) {
            var config = createConfig({
                product: 'bitbucket'
            });
            config.product().id.should.be.eql('bitbucket');
            config.product().isJIRA.should.be.false();
            config.product().isConfluence.should.be.false();
            config.product().isBitbucket.should.be.true();

            done();
        });

        it('should not allow type hipchat from config', function (done) {
            var config = createConfig({
                product: 'hipchat'
            });
            config.product.should.throw();
            done();
        });

        it('should not allow unknown type from config', function (done) {
            var config = createConfig({
                product: 'chatty'
            });
            config.product.should.throw();
            done();
        });
    });

    describe('Whitelist', function () {
        it('should accept single-segment hostnames in dev mode', function (done) {
            matches(createConfig(), 'localhost').should.be.true();
            done();
        });

        it('should accept multi-segment hostnames in dev mode', function (done) {
            matches(createConfig(), 'machine.dyn.syd.atlassian.com').should.be.true();
            done();
        });

        it('should accept fully qualified domain names', function (done) {
            var cfg = createWhiteListConfig("*.atlassian.net");
            matches(cfg, 'connect.atlassian.net').should.be.true();
            done();
        });

        it('should not accept partial domain name matches', function (done) {
            var cfg = createWhiteListConfig("*.jira.com");
            matches(cfg, 'test.jira.com.hh.ht').should.be.false();
            done();
        });

        it('should not accept subdomains', function (done) {
            var cfg = createWhiteListConfig("*.jira.com");
            matches(cfg, 'foo.test.jira.com').should.be.false();
            done();
        });

        it('should accept multiple comma separated patterns', function (done) {
            var cfg = createWhiteListConfig("*.jira.com, *.atlassian.net");
            matches(cfg, 'connect.jira.com').should.be.true();
            matches(cfg, 'connect.atlassian.net').should.be.true();
            matches(cfg, 'connect.jira-dev.com').should.be.false();
            done();
        });

        function matches(cfg, host) {
            return cfg.whitelistRegexp().some(function (re) { return re.test(host); });
        }

        function createWhiteListConfig(domain) {
            return createConfig({ "whitelist": domain });
        }

        function createConfigForEnv(env, domain) {
            return config(domain, {
                "development": subConfig
            });
        }
    });

});
