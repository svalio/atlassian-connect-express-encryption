var _ = require("underscore");
var Q = require("q");

function MemoryStore() {
  this.data = {};
  _.bindAll(this);
}

var proto = MemoryStore.prototype;

proto.get = function (key) {
  return Q.resolve(this.data[key]);
};

proto.set = function (key, value) {
  return Q.resolve(this.data[key] = value);
};

proto.del = function (key) {
  return Q.resolve(delete this.data[key]);
};

proto.hget = function (key) {
  return this.get(key);
};

proto.hset = function (key, hash) {
  return this.set(key, hash);
};

proto.hdel = function (key) {
  return this.del(key);
};

module.exports = function (logger) {
  logger.info("Memory settings store initialized.");
  return new MemoryStore();
};
