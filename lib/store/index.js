var registry = {};

var stores = function (config) {
  var subconfig = config.store();
  return stores.create(subconfig.type, subconfig);
};

stores.create = function (type, subconfig) {
  return registry[type](subconfig);
};

stores.register = function (type, factory) {
  registry[type] = factory;
};

stores.register("memory", require("./memory"));
stores.register("postgres", require("./postgres"));

module.exports = stores;
