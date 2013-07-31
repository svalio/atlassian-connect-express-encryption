var helper = require('./test_helper');
var RSVP = require('rsvp');

module.exports = function (logger, opts) {
  var global = {};
  var scoped = {
    testHostClientKey: {
      clientInfo: helper.clientInfo
    }
  };

  function store(clientKey) {
    return (clientKey ? scoped[clientKey] : global) || {};
  }

  return {

    get: function (key, clientKey) {
      var promise = new RSVP.Promise();
      promise.resolve(store(clientKey)[key]);
      return promise;
    },

    set: function (key, val, clientKey) {
      var promise = new RSVP.Promise();
      store(clientKey)[key] = val;
      promise.resolve();
      return promise;
    },

    del: function (key, clientKey) {
      var promise = new RSVP.Promise();
      delete store(clientKey)[key];
      promise.resolve();
      return promise;
    }

  };
};
