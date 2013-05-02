var request = require("request");
var Q = require("q");
var parser = require("xml2json");

exports.get = function (hostBaseUrl) {
  var dfd = Q.defer();
  var consumerInfoUrl = hostBaseUrl + "/plugins/servlet/oauth/consumer-info";
  request.get(consumerInfoUrl, function (err, res) {
    if (err) {
      return dfd.reject(err);
    }
    var code = res.statusCode;
    if (code !== 200) {
      return dfd.reject(new Error("Unexpected host info response " + code));
    }
    var contentType = res.headers["content-type"];
    if (contentType.indexOf("application/xml") !== 0) {
      return dfd.reject(new Error("Unexpected host info response format " + contentType));
    }
    if (!res.body) {
      return dfd.reject(new Error("No host info response body"));
    }
    try {
      var info = JSON.parse(parser.toJson(res.body));
      if (info == null || info.consumer == null) {
        return dfd.reject(new Error("Unexpected response data " + JSON.stringify(info)));
      }
      dfd.resolve(info.consumer);
    }
    catch (ex) {
      dfd.reject(err);
    }
  });
  return dfd.promise;
};
