var httpClient = require('request');
var _ = require('underscore');
var fs = require('fs');
var oauth = require('./oauth');
var urls = require('url');
var encode = encodeURIComponent;

module.exports = function (context, privateKey) {

  var hostBaseUrl = context.hostBaseUrl;
  var userId = context.userId;
  var appKey = context.appKey;

  var hostClient = function (options, callback) {
    return httpClient.apply(null, modifyArgs(options, callback));
  };

  ['get', 'post', 'put', 'del', 'patch'].forEach(function (method) {
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
    var args = [];

    if (_.isString(options)) {
      options = {uri: options};
    }
    if (options.url) {
      options.uri = options.url;
      delete options.url;
    }

    var urlMod = modifyUrl(options.uri, hostBaseUrl, options.userId || userId);
    options.uri = urlMod[0];
    var isHostUrl = urlMod[1];
    args.push(options);

    if (isHostUrl) {
      if (!options.headers) options.headers = {};

      if (method === "del") {
        // AC-760, Mikeal Rogers' request package uses the shorthand function name 'del' for the DELETE method type
        method = "delete";
      }

      options.headers['Authorization'] = oauth.sign({
        url: options.uri,
        method: method || options.method || 'GET',
        clientKey: options.appKey || appKey,
        privateKey: privateKey,
        signatureMethod: 'RSA-SHA1'
      });
      options.jar = false;
      if (callback) args.push(callback);
    }

    return args;
  }

  function modifyUrl(url, hostBaseUrl, userId) {
    var isHostUrl = false;
    if (url.indexOf('http:') !== 0 && url.indexOf('https:') !== 0) {
      url = urls.format(urls.parse(hostBaseUrl + url));
      if (userId) {
        url += (url.indexOf('?') > 0 ? '&' : '?') + 'user_id=' + encode(userId);
      }
      isHostUrl = true;
    }
    return [url, isHostUrl];
  }

  return hostClient;

};
