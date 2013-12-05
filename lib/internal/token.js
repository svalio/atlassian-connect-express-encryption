var config = require('./config');
var crypto = require('crypto');

exports.verify = function(encryptedToken, maxAge, successCallback, errorCallback) {

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
};

exports.create = function(host, user, allowInsecurePolling) {

  var token = {
    h: host,
    u: user,
    p: allowInsecurePolling ? "1" : "0",
    t: Date.now()
  };

  var tokenSource = JSON.serialize(token);
  return cipher(tokenSource);
};

function cipher(value) {
  var cipher = crypto.createCipher('aes-256-cbc', config.secret());
  return cipher.update(value, 'utf8', 'base64') + cipher.final('base64');
}

function decipher(value) {
  var decipher = crypto.createDecipher('aes-256-cbc', config.secret());
  return decipher.update(value, 'base64', 'utf-8') + decipher.final('utf-8');
}

function hasExpired(token, maxAge) {
  return token.t + maxAge < Date.now();
}