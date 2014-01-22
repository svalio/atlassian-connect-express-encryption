var _ = require('underscore');
var crypto = require('crypto');
var os = require('os');
var utils = require('./utils');

var env = process.env;

module.exports = function (mode, overrides) {
    var config = utils.loadJSON('config.json');

    if (!config.usePubKey) {
      publicKey = utils.loadFile('public-key.pem');
      privateKey = utils.loadFile('private-key.pem');
    }

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

    return _.extend({}, wrap(globalValues), wrap(modeValues), {

        // override simple accessors with more intelligent ones, and add others

        usePubKey: function () {
            return modeValues['usePubKey'] === false ? false : defaults['usePubKey'];
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

        store: function () {
            return modeValues['store'] || defaults['store'];
        },

        hosts: function () {
            return get(modeValues, 'hosts');
        },

        jwt: function () {
            return get(modeValues, 'jwt');
        },

        // Returns the maximum age of a token in milliseconds.
        // The configuration value represents seconds.
        maxTokenAge: function () {
            return get(modeValues, 'maxTokenAge') * 1000;
        },

        publicKey: function () {
            if (this.usePubKey()) {
                return utils.unescapelf(get(modeValues, null, 'AC_PUBLIC_KEY') || publicKey);
            }
            return null;
        },

        privateKey: function () {
            if (this.usePubKey()) {
                return utils.unescapelf(get(modeValues, null, 'AC_PRIVATE_KEY') || privateKey);
            }
            return null;
        },

        secret: function () {
            var salt;
            if (this.usePubKey()) {
                salt = this.privateKey();
            } else {
                salt = modeValues['salt'] || defaults['salt'];
            }
            return crypto.createHash('sha1').update(salt).digest('base64');
        },

        whitelist: function () {
            var list = get(modeValues, 'whitelist', 'AC_HOST_WHITELIST');
            if (!list) {
                list = mode === 'production' ? '*.jira.com' : '*';
            }
            if (_.isString(list)) {
                list = [list];
            }
            return list;
        },

        whitelistRegexp: function () {
            return this.whitelist().map(function (glob) {
                return new RegExp(glob.replace(/\./g, '\\.').replace(/\*/g, '[^.]*'));
            });
        }

    });

};

var defaults = {
    usePubKey: true,
    watch: true,
    port: 3000,
    localBaseUrl: 'http://' + os.hostname() + ':$port',
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
