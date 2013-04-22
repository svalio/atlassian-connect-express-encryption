var _ = require("underscore");
var fs = require("fs");
var crypto = require("crypto");

var env = process.env;

var config = loadConfig("ap3.json");
var publicKey = loadFile("public-key.pem");
var privateKey = loadFile("private-key.pem");

module.exports = function (mode) {

  var values = replaceAll(config[mode] || config["development"], env);

  function get(key, envKey, vars) {
    var value = env[envKey] || values[key] || defaults[key];
    if (vars && _.isString(value)) value = replaceStr(value, vars);
    return value;
  }

  return {

    port: function () {
      return get("port", "PORT");
    },

    localBaseUrl: function () {
      return get("localBaseUrl", "AP3_LOCAL_BASE_URL", {port: this.port()});
    },

    store: function () {
      return values["store"] || defaults["store"];
    },

    hosts: function () {
      return get("hosts");
    },

    publicKey: function () {
      return get(null, "AP3_PUBLIC_KEY") || publicKey;
    },

    privateKey: function () {
      return get(null, "AP3_PRIVATE_KEY") || privateKey;
    },

    secret: function () {
      return crypto.createHash("sha1").update(this.privateKey()).digest("base64");
    }

  };

};

var defaults = {
  port: 3000,
  localBaseUrl: "http://localhost:$port",
  store: "memory",
  hosts: [{
    url: "http://localhost:1990/confluence",
    user: "admin",
    pass: "admin"
  }, {
    url: "http://localhost:2990/jira",
    user: "admin",
    pass: "admin"
  }, {
    url: "http://localhost:5990/refapp",
    user: "admin",
    pass: "admin"
  }]
};

function replaceAll(settings, values) {
  Object.keys(settings, function (k) {
    var setting = settings[k];
    if (_.isString(setting)) {
      settings[k] = replaceStr(setting, values);
    }
    else if (_.isObject(setting)) {
      replaceAll(setting);
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
  return data ? JSON.parse(data) : {};
}
