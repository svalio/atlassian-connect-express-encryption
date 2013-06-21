var _ = require('underscore');
var RSVP = require('rsvp');
var Schema = require('jugglingdb').Schema;
var errmsg = require('../internal/errors').errmsg;

// This Allows easy extension of jugglingdb schemas. It works
// like schema.define, but instead of returning a model ctor,
// it returns a promise of a model ctor.  Under the covers,
// it calls schema.define(), and then, once per event loop in
// which it was called, it ensures that all models defined
// via extend are sync'd with the jugglingdb backend.  When
// sycn'd, it then resolves the returned promise with the
// prepared model ctor.
Schema.prototype.extend = function (name, properties, settings) {
  var Model = this.define(name, properties, settings);
  var promise = new RSVP.Promise;
  function resolve() { promise.resolve(Model); }
  function reject(err) { promise.reject(err, Model); }
  Model.schema.isActual(function (err, actual) {
    if (err) return reject(err);
    if (!actual) Model.schema.autoupdate(resolve);
    else resolve();
  });
  return promise;
};

function JugglingDB(logger, opts) {
  opts = opts || {};
  var self = this;
  self._data = {};
  var promise = self.promise = new RSVP.Promise;
  _.bindAll(self);
  var type = opts.type || 'memory';
  var schema = self.schema = new Schema(type, opts);
  schema.extend('AddonSettings', {
    clientKey:    { type: String, index: true },
    key:          { type: String, index: true },
    val:          Schema.JSON
  }).then(
    function (AddonSettings) {
      self._AddonSettings = AddonSettings;
      logger.info('Initialized ' + type + ' storage adapter');
      promise.resolve();
    },
    function (err) {
      logger.error('Failed to initialize ' + type + ' storage adapter: ' + errmsg(err));
      promise.reject(err);
    }
  );
}

var proto = JugglingDB.prototype;

proto.get = function (key, clientKey) {
  var promise = new RSVP.Promise();
  var self = this;
  self.promise.then(function(){
    self._AddonSettings.all({key: key, clientKey:clientKey}, function(err, arry){
      if (err || arry.length === 0) {
        return promise.reject(err || 'Settings not found');
      }
      promise.resolve(arry[0]);
    });
  });
  return promise;
};

proto.set = function (key, val, clientKey) {
  var promise = new RSVP.Promise();
  var self = this;
  self.promise.then(function(){
    self._AddonSettings.upsert({
      clientKey: clientKey,
      key: key,
      val: val
    }, function(err, model){
      if (err) return promise.reject(err);
      promise.resolve(model);
    });
  });
  return promise;
};

proto.del = function (key, clientKey) {
  var promise = new RSVP.Promise();
  var self = this;
  self.promise.then(function(){
    self._AddonSettings.all({key: key, clientKey: clientKey}, function(err, models){
      RSVP.all(models.map(function(model){
        var subpromise = new RSVP.Promise();
        model.destroy(function(err){
          if (err) return subpromise.reject(err);
          subpromise.resolve();
        });
        return subpromise;
      })).then(
        function () { promise.resolve(); },
        function (err) { promise.reject(err); }
      );
    });
  });
  return promise;
};

module.exports = function (logger, opts) {
  return new JugglingDB(logger, opts);
};
