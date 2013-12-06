var crypto = require('crypto');

module.exports = function (privateKey, publicKey) {

  var ALGO = 'RSA-SHA1';
  var ENCODING= 'hex';
  var UTF8 = 'utf-8';
  var DELIMITER = ':';

  function sign (value) {
    var signer = crypto.createSign(ALGO)
    var signature = signer.sign(privateKey, ENCODING, signer.end(value, UTF8));
    return new Buffer(value, UTF8).toString(ENCODING) + DELIMITER + signature;
  }

  function verify (signedValue) {
    var parts = signedValue.split(DELIMITER);
    if (parts.length != 2) {
      throw new Error('Invalid token format');
    }
    var value = new Buffer(parts[0], ENCODING).toString(UTF8);
    var verifier = crypto.createVerify(ALGO);
    verifier.end(value);
    if (!verifier.verify(publicKey, parts[1], ENCODING)) {
      throw new Error('Invalid signature');
    }
    return value;
  }

  function hasExpired (token, maxAge) {
    return token.t + maxAge < Date.now();
  }

  return {

    verify: function (encryptedToken, maxAge, successCallback, errorCallback) {

      if (!encryptedToken) {
        return errorCallback(new Error('No token present'));
      }

      try {
        var tokenSource = verify(encryptedToken);
        var token = JSON.parse(tokenSource);
        if (hasExpired(token, maxAge)) {
          return errorCallback(new Error('Token has expired'));
        }
        return successCallback(token);
      }
      catch (e) {
        return errorCallback(e);
      }
    },

    create: function (host, clientKey, user) {

      var token = {
        h: host,
        k: clientKey,
        u: user,
        t: Date.now()
      };

      var tokenSource = JSON.stringify(token);
      return sign(tokenSource);
    },

    refresh: function (token) {
      return this.create(token.h, token.k, token.u);
    }
  };
}