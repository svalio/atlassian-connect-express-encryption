var _ = require("underscore");
var fs = require("fs");
var crypto = require("crypto");
var os = require("os");
var uglify = require("uglify-js");
var url = require("url");
var lt = require("localtunnel").client;

var env = process.env;

var config = loadConfig("config.json");
var publicKey = loadFile("public-key.pem");
var privateKey = loadFile("private-key.pem");

module.exports = function (mode, overrides) {
  config = _.extend(config, overrides);
  var globalValues = replaceAll(config, env);
  var modeValues = replaceAll(config[mode] || config["development"], env);

  function get(values, key, envKey, vars) {
    var value = env[envKey] || values[key] || defaults[key];
    if (vars && _.isString(value)) value = replaceStr(value, vars);
    return value;
  }

  function wrap(values) {
    return _.object(Object.keys(values).map(function (k) {
      return [k, function () { return values[k]; }];
    }));
  }

  return _.extend({}, wrap(globalValues), wrap(modeValues), {

    // override simple accessors with more intelligent ones, and add others

    watch: function() {
      if (modeValues["watch"] === false) {
        return false;
      } else {
        return defaults["watch"];
      }
    },

    port: function () {
      return get(modeValues, "port", "PORT");
    },

    localBaseUrl: function () {
      return get(modeValues, "localBaseUrl", "FEEBS_LOCAL_BASE_URL", {port: this.port()});
    },

    store: function () {
      return modeValues["store"] || defaults["store"];
    },

    hosts: function () {
      return get(modeValues, "hosts");
    },

    publicKey: function () {
      return unescapelf(get(modeValues, null, "FEEBS_PUBLIC_KEY") || publicKey);
    },

    privateKey: function () {
      return unescapelf(get(modeValues, null, "FEEBS_PRIVATE_KEY") || privateKey);
    },

    secret: function () {
      return crypto.createHash("sha1").update(this.privateKey()).digest("base64");
    },

    whitelist: function () {
      var list = get(modeValues, "whitelist", "FEEBS_HOST_WHITELIST");
      if (!list) list = mode === "production" ? "*.jira.com" : "*";
      if (_.isString(list)) list = [list];
      return list.map(function (glob) {
        return new RegExp(glob.replace(/\./g, "\\.").replace(/\*/g, "[^.]*"));
      });
    }

  });

};

function unescapelf(str) {
  return str ? str.replace(/\\n/g, "\n") : str;
}

var defaults = {
  watch: true,
  port: 3000,
  localBaseUrl: "http://" + os.hostname() + ":$port",
  store: {
    adapter: "jugglingdb",
    type: "memory"
  },
  hosts: []
};

function replaceAll(settings, values) {
  Object.keys(settings).forEach(function (k) {
    var setting = settings[k];
    if (_.isString(setting)) {
      settings[k] = replaceStr(setting, values);
    }
    else if (_.isObject(setting)) {
      replaceAll(setting, values);
    }
  });
  return settings;
}

function replaceStr(setting, values) {
  return setting.replace(/\$([a-zA-Z]\w*)/g, function ($0, $1) {
    return values[$1] || $0;
  });
}

function loadFile(path) {
  return fs.existsSync(path) ? fs.readFileSync(path).toString() : null;
}

function loadConfig(path) {
  var data = {};
  try {
    data = loadFile(path);
  } catch(e) {}
  // Stupid hack to get Uglify to parse the json
  return data ? JSON.parse(uglify.minify("t="+data,{fromString:true,output:{"quote_keys":true}}).code.slice(2).replace(/;$/g,"")) : {};
}
