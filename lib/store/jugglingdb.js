var _ = require("underscore");
var RSVP = require("rsvp");
var Schema = require('jugglingdb').Schema;

function JugglingDB(type, opts) {
  this._data = {};
  _.bindAll(this);
  var promise = this.promise = new RSVP.Promise();
  var schema = this.schema = new Schema(type, opts || {});
  var AddonSettings = this._AddonSettings = schema.define('AddonSettings', {
    clientKey:    String,
    settings:     String
  });
  AddonSettings.schema.isActual(function(err, actual) {
    if (err) {
      promise.reject(err);
      return;
    }
    if (!actual) {
      AddonSettings.schema.autoupdate(function(){
        promise.resolve();
      });
    } else {
      promise.resolve();
    }
  });
}

var proto = JugglingDB.prototype;

proto.get = function (key) {
  var promise = new RSVP.Promise();
  var self = this;
  self.promise.then(function(){
    self._AddonSettings.all( function(err, arry){
      if (!err && arry.length !== 0) {
        try {
          promise.resolve(JSON.parse(arry[0]));
        } catch (e) {
          promise.resolve(arry[0]);
        }
      } else {
        promise.reject(err || "Settings not found");
      }
    });
  });
  return promise;
};

proto.set = function (key, value) {
  var promise = new RSVP.Promise();
  var self = this;
  self.promise.then(function(){
    self._AddonSettings.upsert({
      clientKey: key,
      settings: JSON.stringify(value)
    }, function(err, model){
      if (!err) {
        promise.resolve(model)
      } else {
        promise.reject(err);
      }
    });
  });
  return promise;
};

proto.del = function (key) {
  var promise = new RSVP.Promise();
  var self = this;
  self.promise.then(function(){
    self._AddonSettings.all({clientKey: key}, function(err, models){
      models.forEach(function(model){
        model.destroy(function(err){
          if (!err) {
            promise.resolve();
          } else {
            promise.reject(err);
          }
        });
      });
    });
  });
  return promise;
};

module.exports = function (logger, config) {
  logger.info("Memory settings store initialized.");
  return new JugglingDB(config.type, config.opts);
};
