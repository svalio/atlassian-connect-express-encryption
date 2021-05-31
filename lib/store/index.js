const registry = {};

// Expects opts to be of the following form:
// {
//   'adapter': 'sequelize' // default
//   // the sequelize adapter can accept a 'dialect' to specify it's backend.
//   'dialect': 'memory'
//   // additional adapter-specific options, if any
//   ...
// }
const stores = function (logger, opts) {
  return stores.create(opts.adapter || "sequelize", logger, opts);
};

stores.create = function (adapter, logger, opts) {
  const factory = registry[adapter];
  if (!factory) {
    throw new Error(`Unregistered adapter value '${adapter}'`);
  }
  return factory(logger, opts);
};

stores.register = function (adapter, factory) {
  registry[adapter] = factory;
};

stores.register("sequelize", require("./sequelize"));
stores.register("mongodb", require("./mongodb"));
stores.register("redis", require("./redis"));
stores.register("dynamodb", require("./dynamodb"));

module.exports = stores;
