var _ = require('lodash');
var crypto = require('crypto');
var os = require('os');
var utils = require('./utils');
var URI = require('urijs');

var env = process.env;

module.exports = function (mode, overrides) {
    var config = utils.loadJSON('config.json');

    config = _.extend(config, overrides);
    var globalValues = utils.replaceAll(config, env);
    var modeValues = utils.replaceAll(config[mode] || config['development'], env);

    function get(values, key, envKey, vars) {
        var value = env[envKey] || values[key] || defaults[key];
        if (vars && _.isString(value)) {
            value = utils.replaceStr(value, vars);
        }
        return value;
    }

    function wrap(values) {
        return _.object(Object.keys(values).map(function (k) {
            return [k, function () {
                return values[k];
            }];
        }));
    }

    function includeCredentialsHosts() {
        var creds = utils.loadJSON("credentials.json");
        var host_obj = creds['hosts'];
        if (!host_obj){
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

            if (host_obj[host].product && host_obj[host].product.toLowerCase() === "confluence") {
                url.segment("wiki");
            }

            urls.push(url.toString());
        }
        return urls;
    }

    return _.extend({}, wrap(globalValues), wrap(modeValues), {

        // override simple accessors with more intelligent ones, and add others

        validatePublicKey: function () {
            if (env['AC_VALIDATE_PUBLIC_KEY'] === "false"
                || modeValues['validatePublicKey'] === false) {
              return false;
            }
            return defaults['validatePublicKey'];
        },

        expressErrorHandling: function() {
            return modeValues['expressErrorHandling'] === true ? true : defaults['expressErrorHandling'];
        },

        errorTemplate: function() {
            return modeValues['errorTemplate'] === true ? true : defaults['errorTemplate'];
        },

        watch: function () {
            return modeValues['watch'] === false ? false : defaults['watch'];
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
            return modeValues['store'] || defaults['store'];
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
                list = mode === 'production' ? '*.jira.com' : '';
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
    validatePublicKey: true,
    expressErrorHandling: false,
    errorTemplate: false,
    watch: true,
    port: 3000,
    localBaseUrl: 'http://' + os.hostname() + ':$port',
    environment: 'development',
    store: {
        adapter: 'jugglingdb',
        type: 'memory'
    },
    jwt: {
        validityInMinutes: 3
    },
    hosts: [],
    maxTokenAge: 15 * 60
};
