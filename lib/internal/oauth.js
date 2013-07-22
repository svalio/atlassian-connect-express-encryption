// modified from https://bitbucket.org/knecht_andreas/atlassian-oauth-validator
var crypto = require('crypto');
var urls = require('url');
var qs = require('querystring');
var _ = require('underscore');
var encode = encodeURIComponent;

exports.verify = function (options, callback) {
  var verifier = crypto.createVerify(options.signatureMethod);
  var normParams = normaliseRequestParams(options.query);
  var signatureBase = createSignatureBase(options.method, options.url, normParams);
  verifier.update(signatureBase);
  if (verifier.verify(ensurePem('PUBLIC', options.publicKey), options.signature, 'base64')) {
    callback();
  } else {
    callback(new Error('Invalid signature'));
  }
};

exports.sign = function (options) {
  var signer = crypto.createSign(options.signatureMethod);
  var timestamp = Math.floor((new Date()).getTime() / 1000).toString();
  var oauth = {
    oauth_consumer_key: options.clientKey,
    oauth_signature_method: options.signatureMethod,
    oauth_timestamp: timestamp,
    oauth_nonce: nonce(timestamp),
    oauth_version: '1.0'
  };
  var url = urls.parse(options.url);
  var baseUrl = url.protocol + '//' + url.host + url.pathname;
  var query = _.extend(qs.parse(url.query || ''), oauth);
  var signatureBase = createSignatureBase(options.method, baseUrl, normaliseRequestParams(query));
  signer.update(signatureBase);
  var signature = signer.sign(ensurePem('PRIVATE', options.privateKey), 'base64');
  var header = '';
  Object.keys(oauth).forEach(function (k) {
    header += (header.length > 0 ? ', ' : '') + k + '=\'' + encode(oauth[k]) + '\'';
  });
  return 'OAuth ' + header + ', oauth_signature=\'' + encode(signature) + '\'';
};

function nonce(timestamp) {
  var chars = '0123456789';
  var result = timestamp.toString();
  for (var i = 0; i < 9; ++i) {
    var rnum = Math.floor(Math.random() * chars.length);
    result += chars.substring(rnum, rnum + 1);
  }
  return result;
}

function ensurePem(type, key) {
  if (key.indexOf(type + ' KEY') > 0) {
    return key;
  }
  return '' +
    '-----BEGIN ' + type + ' KEY-----\n' +
    key.match(/(.{1,64})/g).join('\n') +
    '\n-----END ' + type + ' KEY-----';
}

/**
 * MODIFIED FROM https://github.com/ciaranj/node-oauth/.  Full credits go to ciaranj for this code!
 */

var encodeData = function (toEncode) {
  if (toEncode == null || toEncode == '') {
    return '';
  } else {
    var result = encodeURIComponent(toEncode);
    // Fix the mismatch between OAuth's RFC3986's and Javascript's beliefs in what is right and wrong ;)
    return result.replace(/!/g, '%21')
      .replace(/'/g, '%27')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29')
      .replace(/\*/g, '%2A');
  }
};

// Sorts the encoded key value pairs by encoded name, then encoded value
var sortRequestParams = function (argument_pairs) {
  // Sort by name, then value.
  argument_pairs.sort(function (a, b) {
    if (a[0] == b[0]) {
      return a[1] < b[1] ? -1 : 1;
    } else {
      return a[0] < b[0] ? -1 : 1;
    }
  });

  return argument_pairs;
};

var makeArrayOfArgumentsHash = function (argumentsHash) {
  var argument_pairs = [];
  for (var key in argumentsHash) {
    if (argumentsHash.hasOwnProperty(key)) {
      if (key === 'oauth_signature') {
        continue;
      }
      var value = argumentsHash[key];
      if (Array.isArray(value)) {
        for (var i = 0; i < value.length; i++) {
          argument_pairs[argument_pairs.length] = [key, value[i]];
        }
      } else {
        argument_pairs[argument_pairs.length] = [key, value];
      }
    }
  }
  return argument_pairs;
};

var normaliseRequestParams = function (arguments) {
  var argument_pairs = makeArrayOfArgumentsHash(arguments);
  var i;
  // First encode them #3.4.1.3.2 .1
  for (i = 0; i < argument_pairs.length; i++) {
    argument_pairs[i][0] = encodeData(argument_pairs[i][0]);
    argument_pairs[i][1] = encodeData(argument_pairs[i][1]);
  }

  // Then sort them #3.4.1.3.2 .2
  argument_pairs = sortRequestParams(argument_pairs);

  // Then concatenate together #3.4.1.3.2 .3 & .4
  var args = '';
  for (i = 0; i < argument_pairs.length; i++) {
    args += argument_pairs[i][0];
    args += '=';
    args += argument_pairs[i][1];
    if (i < argument_pairs.length - 1) args += '&';
  }
  return args;
};

var createSignatureBase = function (method, url, params) {
  url = encodeData(url);
  params = encodeData(params);
  return method.toUpperCase() + '&' + url + (params ? '&' + params : '');
};

/**
 * END OF MODIFIED CODE FROM https://github.com/ciaranj/node-oauth/.  Full credits go to ciaranj for this code!
 */
