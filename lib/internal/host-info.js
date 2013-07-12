var request = require('request');
var RSVP = require('rsvp');
var parser = require('xml2json');

exports.get = function (hostBaseUrl) {
  var promise = new RSVP.Promise;
  var consumerInfoUrl = hostBaseUrl + '/plugins/servlet/oauth/consumer-info';
  request.get(consumerInfoUrl, function (err, res) {
    if (err) {
      return promise.reject(err);
    }
    var code = res.statusCode;
    if (code !== 200) {
      return promise.reject(new Error('Unexpected host info response ' + code));
    }
    var contentType = res.headers['content-type'];
    if (contentType.indexOf('application/xml') !== 0) {
      return promise.reject(new Error('Unexpected host info response format ' + contentType));
    }
    if (!res.body) {
      return promise.reject(new Error('No host info response body'));
    }
    try {
      var info = JSON.parse(parser.toJson(res.body));
      if (info == null || info.consumer == null) {
        return promise.reject(new Error('Unexpected response data ' + JSON.stringify(info)));
      }
      promise.resolve(info.consumer);
    }
    catch (ex) {
      promise.reject(err);
    }
  });
  return promise;
};
