var redis = require("redis");
var Q = require("q");
var _ = require("underscore");

var initDeferred = Q.defer();
var initPromise = initDeferred.promise;
var client = redis.createClient();

client.once("ready", function () {
  console.log("Redis store activated.");
  initDeferred.resolve(new RedisStore(client));
});

client.once("error", function () {
  console.warn("WARNING: Redis not available; using memory store.");
  initDeferred.resolve(new MemoryStore());
});

["get", "set", "hget", "hset"].forEach(function (name) {
  exports[name] = function () {
    var args = arguments;
    var deferred = Q.defer();
    initPromise.then(function (store) {
      store[name].apply(store, args).then(
        deferred.resolve,
        deferred.reject
      );
    });
    return deferred.promise;
  };
});

var RedisStore = function () {

  function RedisStore(client) {
    this.client = client;
    _.bindAll(this);
  }

  var proto = RedisStore.prototype;

  proto.get = function (key) {
    return Q.ninvoke(this.client, "get", key);
  };

  proto.set = function (key, value) {
    return Q.ninvoke(this.client, "set", key, value);
  };

  proto.hget = function (key) {
    return Q.ninvoke(this.client, "hgetall", key);
  };

  proto.hset = function (key, hash) {
    return Q.ninvoke(this.client, "hmset", key, hash);
  };

  return RedisStore;

}();

var MemoryStore = function () {

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

  proto.hget = function (key) {
    return this.get(key);
  };

  proto.hset = function (key, hash) {
    return this.set(key, hash);
  };

  return MemoryStore;

}();
