var _ = require("underscore");
var RSVP = require("rsvp");
var Schema = require('jugglingdb').Schema;

function JugglingDB(type, opts) {
  this._data = {};
  _.bindAll(this);
  var promise = this.promise = new RSVP.Promise();
  var schema = this.schema = new Schema(type, opts || {});
  var AddonSettings = this._AddonSettings = schema.define('AddonSettings', {
    clientKey:    { type: String, index: true },
    key:          { type: String, index: true },
    val:          Schema.JSON
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

proto.get = function (key, clientKey) {
  var promise = new RSVP.Promise();
  var self = this;
  self.promise.then(function(){
    self._AddonSettings.all({key: key, clientKey:clientKey}, function(err, arry){
      if (!err && arry.length !== 0) {
        promise.resolve(arry[0]);
      } else {
        promise.reject(err || "Settings not found");
      }
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
      if (!err) {
        promise.resolve(model)
      } else {
        promise.reject(err);
      }
    });
  });
  return promise;
};

proto.del = function (key, clientKey) {
  var promise = new RSVP.Promise();
  var self = this;
  self.promise.then(function(){
    self._AddonSettings.all({key: key, clientKey: clientKey}, function(err, models){
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
  logger.info("Settings store initialized.");
  return new JugglingDB(config.type, config.opts);
};
