var helper = require('./test_helper');
var oauth = require('../lib/internal/oauth');

exports.signAsUrl = function (options) {
  var header = exports.signAsHeader(options);
  var qs = header.slice(6).split(',').map(function (kvstring) {
    var parts = kvstring.trim().split('=');
    return [parts[0], parts[1].slice(1, parts[1].length - 1)];
  }).reduce(function (prev, curr) {
    return prev + (prev ? '&' : '') + curr[0] + '=' + curr[1];
  }, '');
  return options.url + (options.url.indexOf('?') > 0 ? '&' : '?') + qs;
};

exports.signAsHeader = function (options) {
  return oauth.sign({
    url: options.url,
    method: options.method || 'GET',
    clientKey: options.clientKey,
    privateKey: options.privateKey || process.env.AC_PRIVATE_KEY,
    signatureMethod: 'RSA-SHA1'
  });
};
