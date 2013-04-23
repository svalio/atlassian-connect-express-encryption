var registry = {};

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

stores.register("memory", require("./memory"));
stores.register("postgres", require("./postgres"));

module.exports = stores;
