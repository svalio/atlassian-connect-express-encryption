// modified from https://bitbucket.org/knecht_andreas/atlassian-oauth-validator
var _ = require("underscore");
var urls = require("url");
var oauth = require("../internal/oauth");

module.exports = function (addon, optionalPublicKey) {
  addon.emit('oauth_verification_triggered');
  // allows disabling of oauth for testing/debugging
  if (/no-oauth/.test(process.env.FEEBS_OPTS)) {
    return function(req, res, next) {
      next();
    };
  };

  var maxTimestampAge = 5 * 60 * 1000;
  var usedNonces = [];

  function expireOldNonces(currentTime) {
    var min = (currentTime - maxTimestampAge + 500) / 1000;
    usedNonces = _.filter(usedNonces, function (item) {
      return item.time > min;
    });
  }

  return function (req, res, next) {
    var authHeader = req.get("authorization");
    var params, clientKey, version, nonce, method, timestamp, signature;

    if (authHeader && authHeader.indexOf("OAuth ") === 0) {
      params = _.object(authHeader.slice(6)
        .split(",")
        .filter(function (s) {
          return !!s;
        })
        .map(function (s) {
          var nv = s.split("=");
          var n = nv[0].trim();
          var v = nv[1].trim().slice(1, nv[1].length - 1);
          return [n, decodeURIComponent(v)];
        })
      );
      params = _.extend(params, req.query);
    }
    else {
      params = req.query || {};
    }

    clientKey = params["oauth_consumer_key"];
    version = params["oauth_version"];
    nonce = params["oauth_nonce"];
    method = params["oauth_signature_method"];
    timestamp = params["oauth_timestamp"];
    signature = params["oauth_signature"];

    function send(code, msg) {
      addon.logger.error("OAuth verification error:", code, msg);
      res.send(code, msg);
    }

    if (req.session && req.session.clientKey) {
      return next();
    }

    if (!version || isNaN(version) || version > 1.0) {
      console.log("");
      return send(400, "Invalid oauth version specified: " + version);
    }

    if (!timestamp || isNaN(timestamp)) {
      return send(400, "Invalid oauth timestamp specified: " + timestamp);
    }

    if (!nonce) {
      return send(400, "Invalid oauth nonce specified: " + nonce);
    }

    var alreadyUsed = _.any(usedNonces, function (item) {
      return item.nonce == nonce;
    });

    if (alreadyUsed) {
      return send(401, "OAuth nonce already used.");
    }

    if (addon.app.get("env") !== "development") {
      var now = Date.now();
      usedNonces.push({nonce: nonce, time: now});

      expireOldNonces(now);

      var min = (now - maxTimestampAge + 500) / 1000;
      var max = (now + maxTimestampAge + 500) / 1000;

      if (timestamp < min || timestamp > max) {
        return send(401, "OAuth timestamp refused.");
      }
    }

    var path = req.originalUrl;
    var qIndex = path.indexOf("?");
    if (qIndex >= 0) path = path.slice(0, qIndex);
    var url = urls.parse(addon.config.localBaseUrl());
    url.pathname = path;
    url = urls.format(url);

    function verify(publicKey) {
      oauth.verify({
        method: req.method,
        url: url,
        query: params,
        publicKey: publicKey,
        signature: signature,
        signatureMethod: method,
        logger: addon.logger
      }, function (err) {
        if (err) {
          send(401, "OAuth request not authenticated: " + err.message)
        }
        else {
          req.session.clientKey = clientKey;
          next();
        }
      });
    }

    if (optionalPublicKey) {
      verify(optionalPublicKey);
    }
    else {
      addon.settings.get(clientKey).then(
        function (consumer) {
          if (!consumer) {
            send(401, "OAuth consumer " + clientKey + " not approved to make requests.");
          }
          else {
            verify(consumer.publicKey);
          }
        },
        function (err) {
          send(401, "OAuth request not authenticated due to consumer lookup failure: " + err)
        }
      );
    }

  };

};
