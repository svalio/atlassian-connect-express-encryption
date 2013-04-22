var httpClient = require("request");
var _ = require("underscore");
var fs = require("fs");
var oauth = require("./oauth");
var urls = require("url");
var encode = encodeURIComponent;

module.exports = function (request, privateKey) {

  var hostClient = function (options, callback) {
    return httpClient.apply(null, modifyArgs(options, callback));
  };

  ["get", "post", "put", "del", "patch"].forEach(function (method) {
    hostClient[method] = function (options, callback) {
      var args = modifyArgs(options, callback, method);
      return httpClient[method].apply(null, args);
    };
  });

  hostClient.defaults = function (options) {
    return httpClient.defaults.apply(null, modifyArgs(options));
  };

  hostClient.cookie = function () {
    return httpClient.cookie.apply(null, arguments);
  };

  hostClient.jar = function () {
    return httpClient.jar();
  };

  function modifyArgs(options, callback, method) {
    var ctx = request.context;
    var args = [];

    if (_.isString(options)) {
      options = {uri: options};
    }
    if (options.url) {
      options.uri = options.url;
      delete options.url;
    }

    var userId = options.userId ? options.userId : ctx.userId;
    // @todo do we really need/want the appKey override? double check this
    var appKey = options.appKey ? options.appKey : ctx.appKey;

    var urlMod = modifyUrl(options.uri, ctx.hostBaseUrl, userId);
    options.uri = urlMod[0];
    var isHostUrl = urlMod[1];
    args.push(options);

    if (isHostUrl) {
      if (!options.headers) options.headers = {};
      options.headers["Authorization"] = oauth.sign({
        url: options.uri,
        method: method || options.method || "GET",
        clientKey: appKey,
        privateKey: privateKey,
        signatureMethod: "RSA-SHA1"
      });
      options.jar = false;
      if (callback) args.push(callback);
    }

    return args;
  }

  function modifyUrl(url, hostBaseUrl, userId) {
    var isHostUrl = false;
    if (url.indexOf("http:") !== 0 && url.indexOf("https:") !== 0) {
      url = urls.format(urls.parse(hostBaseUrl + url));
      url += (url.indexOf("?") > 0 ? "&" : "?") + "user_id=" + encode(userId);
      isHostUrl = true;
    }
    return [url, isHostUrl];
  }

  return hostClient;

};
