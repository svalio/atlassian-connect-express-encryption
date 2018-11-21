var registry = {};

// Expects opts to be of the following form:
// {
//   'adapter': 'sequelize' // default
//   // the sequelize adapter can accept a 'dialect' to specify it's backend. 
//   'dialect': 'memory'
//   // additional adapter-specific options, if any
//   ...
// }
var stores = function (logger, opts) {
  return stores.create(opts.adapter || 'sequelize', logger, opts);
};

stores.create = function (adapter, logger, opts) {
  var factory = registry[adapter];
  if (!factory) throw new Error('Unregistered adapter value \'' + adapter + '\'');
  return factory(logger, opts);
};

stores.register = function (adapter, factory) {
  registry[adapter] = factory;
};

stores.register("sequelize", require("./sequelize"));
stores.register("mongodb", require("./mongodb"));

module.exports = stores;