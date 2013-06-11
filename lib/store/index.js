var registry = {};

// Supported JugglingDB adapters
// https://github.com/1602/jugglingdb
const ADAPTERS = [
  'memory',
  'firebird',
  'mongodb',
  'mysql',
  'nano',
  'postgres',
  'redis',
  'rethink',
  'sqlite3'
];

// Expects:
// {
//   "store": {
//     "type": "memory", // default. visit https://github.com/1602/jugglingdb for all supported schemas,
//     "adapter": "jugglingdb" // default
//     "opts": {
//       // .. DB connect opts
//     }
//   }
// }
var stores = function (logger, config) {
  var subconfig = config.store();
  return stores.create(subconfig.type, logger, subconfig);
};

stores.create = function (type, logger, subconfig) {
  return registry[type](logger, subconfig);
};

stores.register = function (type, factory) {
  registry[type] = factory;
};

ADAPTERS.forEach(function(db){
  stores.register(db, require("./jugglingdb"));
})

module.exports = stores;
