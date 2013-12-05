var crypto = require('crypto');

module.exports = function (secret) {

  function cipher (value) {
    var cipher = crypto.createCipher('aes-256-cbc', secret);
    return cipher.update(value, 'utf8', 'hex') + cipher.final('hex');
  }

  function decipher (value) {
    var decipher = crypto.createDecipher('aes-256-cbc', secret);
    return decipher.update(value, 'hex', 'utf-8') + decipher.final('utf-8');
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
        var tokenSource = decipher(encryptedToken);
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

    create: function (host, user, allowInsecurePolling) {

      var token = {
        h: host,
        u: user,
        p: allowInsecurePolling ? 1 : 0,
        t: Date.now()
      };

      var tokenSource = JSON.stringify(token);
      return cipher(tokenSource);
    },

    refresh: function (token) {
      if (0 == token.p) {
        throw new Error('Token does not allow refreshing');
      }
      return this.create(token.h, token.u, token.p);
    }
  };
}