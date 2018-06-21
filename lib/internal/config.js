var _ = require('lodash');
var crypto = require('crypto');
var os = require('os');
var utils = require('./utils');
var URI = require('urijs');

var env = process.env;

var PRODUCTS = {
    JIRA: {
        id: 'jira'
    },
    CONFLUENCE: {
        id: 'confluence'
    },
    BITBUCKET: {
        id: 'bitbucket'
    },
};

var isProductChecker = function (productKey) {
    return function () {
        return this.id === productKey;
    };
};

_.each(PRODUCTS, function (p) {
    p.isJIRA = isProductChecker('jira').call(p);
    p.isConfluence = isProductChecker('confluence').call(p);
    p.isBitbucket = isProductChecker('bitbucket').call(p);
});

module.exports = function (config, mode, overrides) {
    config = _.merge(config, overrides);
    var globalValues = utils.replaceAll(config, env);
    var modeValues = utils.replaceAll(config[mode] || config.development, env);

    function get(values, key, envKey, vars) {
        var value = env[envKey] || values[key] || defaults[key];
        if (vars && _.isString(value)) {
            value = utils.replaceStr(value, vars);
        }
        return value;
    }

    function wrap(values) {
        return _.fromPairs(Object.keys(values).map(function (k) {
            return [k, function () {
                return values[k];
            }];
        }));
    }

    function includeCredentialsHosts() {
        var creds = utils.loadJSON("credentials.json");
        var host_obj = creds.hosts;
        if (!host_obj) {
            return [];
        }
        var hosts = Object.keys(host_obj);

        var urls = [];
        for (var i in hosts) {
            var host = hosts[i];
            var url = new URI(host);
            url.protocol("https")
                .username(host_obj[host].username)
                .password(host_obj[host].password);

            if (typeof host_obj[host].product === 'string' && host_obj[host].product.toLowerCase() === "confluence") {
                url.segment("wiki");
            }

            urls.push(url.toString());
        }
        return urls;
    }

    return _.extend({}, wrap(globalValues), wrap(modeValues), {
        // override simple accessors with more intelligent ones, and add others
        expressErrorHandling: function() {
            return modeValues.expressErrorHandling === true ? true : defaults.expressErrorHandling;
        },

        errorTemplate: function() {
            return modeValues.errorTemplate === true ? true : defaults.errorTemplate;
        },

        watch: function () {
            return modeValues.watch === false ? false : defaults.watch;
        },

        port: function () {
            return get(modeValues, 'port', 'PORT');
        },

        localBaseUrl: function () {
            return get(modeValues, 'localBaseUrl', 'AC_LOCAL_BASE_URL', {port: this.port()});
        },

        environment: function () {
            return get(modeValues, 'environment', 'NODE_ENV');
        },

        store: function () {
            return modeValues.store || defaults.store;
        },

        product: function () {
            var configProduct = env.AC_PRODUCT || modeValues.product || globalValues.product || defaults.product;
            var product = _.find(PRODUCTS, { id: configProduct });

            if (!product) {
                throw new Error('Product ' + configProduct + ' not supported. Valid values: [' + _.map(PRODUCTS, 'id').join(', ') + ']');
            }
            return product;
        },

        hosts: function () {
            return get(modeValues, 'hosts').concat(includeCredentialsHosts());
        },

        jwt: function () {
            return get(modeValues, 'jwt');
        },

        // Returns the maximum age of a token in milliseconds.
        // The configuration value represents seconds.
        maxTokenAge: function () {
            return get(modeValues, 'maxTokenAge') * 1000;
        },

        whitelist: function () {
            var list = get(modeValues, 'whitelist', 'AC_HOST_WHITELIST');
            if (!list) {
                if (mode === 'production') {
                    var product = this.product();
                    if (product.isJIRA || product.isConfluence) {
                        list = '*.atlassian.net';
                    }
                } else {
                    list = '';
                }
            }
            if (_.isString(list)) {
                list = list.split(',').map(function(glob) {
                    return glob.trim();
                });
            }
            return list;
        },

        whitelistRegexp: function () {
            return this.whitelist().map(function (glob) {
                return glob !== '' ? new RegExp('^' + glob.replace(/\./g, '\\.').replace(/\*/g, '[^.]*') + '$') : new RegExp('.*');
            });
        }
    });

};

var defaults = {
    expressErrorHandling: false,
    errorTemplate: false,
    watch: true,
    port: 3000,
    localBaseUrl: 'http://' + os.hostname() + ':$port',
    environment: 'development',
    store: {
        adapter: 'sequelize',
        type: 'memory'
    },
    jwt: {
        validityInMinutes: 3
    },
    product: 'jira', // Can be: 'jira', 'confluence', 'bitbucket'
    hosts: [],
    maxTokenAge: 15 * 60
};
