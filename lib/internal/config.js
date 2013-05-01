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

module.exports = function (mode) {

  var globalValues = replaceAll(config, env);
  var modeValues = replaceAll(config[mode] || config["development"], env);

  function get(values, key, envKey, vars) {
    var value = env[envKey] || values[key] || defaults[key];
    if (vars && _.isString(value)) value = replaceStr(value, vars);
    return value;
  }

  return {

    // @todo add globalValues accessors

    port: function () {
      return get(modeValues, "port", "PORT");
    },

    localBaseUrl: function () {
      return get(modeValues, "localBaseUrl", "AP3_LOCAL_BASE_URL", {port: this.port()});
    },

    store: function () {
      return modeValues["store"] || defaults["store"];
    },

    hosts: function () {
      return get(modeValues, "hosts");
    },

    publicKey: function () {
      return unescapelf(get(modeValues, null, "AP3_PUBLIC_KEY") || publicKey);
    },

    privateKey: function () {
      return unescapelf(get(modeValues, null, "AP3_PRIVATE_KEY") || privateKey);
    },

    secret: function () {
      return crypto.createHash("sha1").update(this.privateKey()).digest("base64");
    },

    whitelist: function () {
      var list = get(modeValues, "whitelist", "AP3_HOST_WHITELIST");
      if (!list) list = mode === "production" ? "*.jira.com" : "*";
      if (_.isString(list)) list = [list];
      return list.map(function (glob) {
        return new RegExp(glob.replace(/\./g, "\\.").replace(/\*/g, "[^.]*"));
      });
    }

  };

};

function unescapelf(str) {
  return str ? str.replace(/\\n/g, "\n") : str;
}

var defaults = {
  // @todo add globalValues defaults
  port: 3000,
  localBaseUrl: "http://" + os.hostname() + ":$port",
  store: {
    type: "memory"
  },
  hosts: [
    "http://admin:admin@localhost:1990/confluence",
    "http://admin:admin@localhost:2990/jira",
    "http://admin:admin@localhost:5990/refapp"
  ]
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
  var data = loadFile(path);
  // Stupid hack to get Uglify to parse the json
  return data ? JSON.parse(uglify.minify("t="+data,{fromString:true,output:{"quote_keys":true}}).code.slice(2).replace(/;$/g,"")) : {};
}
