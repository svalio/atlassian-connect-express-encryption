var _ = require("underscore");
var Q = require("q");
var pg = require("pg");
var hstore = require("pg-hstore");

function HStore(client, table) {
  this.client = client;
  this.table = table;
  _.bindAll(this);
}

var proto = HStore.prototype;

proto.get = function (key) {
  var dfd = Q.defer();
  this.hget(key).then(
    function (hash) { dfd.resolve(hash.value); },
    dfd.reject
  );
  return dfd.promise;
};

proto.set = function (key, value) {
  return this.hset(key, {value: value});
};

proto.del = function (key) {
  var dfd = Q.defer();
  this.hdel(key).then(
    function () { dfd.resolve(); },
    dfd.reject
  );
  return dfd.promise;
};

proto.hget = function (key) {
  var dfd = Q.defer();
  var select = "SELECT hash FROM " + this.table + " WHERE key = $1;";
  this.client.exec(select, [key]).then(
    function (result) {
      var row = result.rows[0];
      if (row.hash) {
        var hs = row.hash;
        hstore.parse(hs, dfd.resolve);
      }
      else {
        dfd.resolve(null);
      }
    },
    dfd.reject
  );
  return dfd.promise;
};

proto.hset = function (key, hash) {
  var self = this;
  var dfd = Q.defer();
  // upsert by first trying update, then insert should the update have affected 0 rows
  hstore.stringify(hash, function (hs) {
    // attempt to update by key
    var update = "UPDATE " + self.table + " SET hash = $2 WHERE (key = $1);";
    self.client.exec(update, [key, hs]).then(
      function (result) {
        if (result.rowCount === 0) {
          // nothing updated, so execute an insert instead
          var insert = "INSERT INTO " + self.table + " (key, hash) VALUES ($1, $2)";
          self.client.exec(insert, [key, hs]).then(
            function () { dfd.resolve(hash); },
            dfd.reject
          );
        }
        else {
          // the update took affect, so resolve immediately
          dfd.resolve(hash);
        }
      },
      dfd.reject
    );
  });
  return dfd.promise;
};

proto.hdel = function (key) {
  var dfd = Q.defer();
  var del = "DELETE FROM " + this.table + " WHERE key = $1;";
  this.client.exec(del, [key]).then(
    function () { dfd.resolve(); },
    dfd.reject
  );
  return dfd.promise;
};

function Client(url) {
  return {
    exec: function (stmt, vars) {
      var dfd = Q.defer();
      pg.connect(url, function (err, client, done) {
        if (err) {
          dfd.reject(err);
          done();
        }
        else {
          client.query(stmt, vars, function (err, result) {
            if (err) {
              dfd.reject(err + " -> " + stmt + (vars ? " [" + vars + "]" : ""));
            }
            else {
              dfd.resolve(result);
            }
            done();
          });
        }
      });
      return dfd.promise;
    }
  };
}

// returns a proxy that will buffer calls until the client has connected,
// or fallback to a memory store on failure
module.exports = function (config) {

  var table = config.table || "ap3_plugin_settings";
  var proxy = {};
  var proxyDfd = Q.defer();
  var store;

  // err fn falls back to using a memory store
  function reject(err) {
    console.warn("Postgres initialization error; using memory store.\n" + err);
    proxyDfd.resolve(require("./index").create("memory"));
  }

  var client = Client(config.connection);

  // enable hstore if not already set up
  client.exec("CREATE EXTENSION IF NOT EXISTS hstore;").then(
    function () {
      // make sure the settings table exists
      client.exec("CREATE TABLE IF NOT EXISTS " + table + " (id serial, key varchar(64) PRIMARY KEY, hash hstore);").then(
        function () {
          // all ready
          console.log("Postgres settings store initialized.");
          proxyDfd.resolve(new HStore(client, table));
        },
        reject
      );
    },
    reject
  );

  proxyDfd.promise.then(function (impl) {
    store = impl;
  });

  // proxy the storage commands to the actual instance when ready
  ["get", "set", "del", "hget", "hset", "hdel"].forEach(function (name) {
    proxy[name] = function () {
      var args = arguments;
      var dfd = Q.defer();
      proxyDfd.promise.then(function (store) {
        // when the store is ready, delegate the buffered command to it
        store[name].apply(store, args).then(dfd.resolve, dfd.reject);
      });
      return dfd.promise;
    };
  });

  return proxy;

};
