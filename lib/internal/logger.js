var _ = require("underscore");
var colors = require("colors");

var logger = {};
var ops = {"info": "grey", "warn": "yellow", "error": "red"};
_.keys(ops).forEach(function (op) {
  logger[op] = function () {
    // Disable logging during tests
    if(/test/g.test(process.env.FEEBS_OPTS)) {
      return;
    }
    var args = [].slice.call(arguments);
    console[op].apply(console, args.map(function (arg) {
      // @todo stringify objects with util.inspect and then apply styles to the resulting string
      return _.isObject(arg) ? arg : new String(arg)[ops[op]].bold;
    }));
  };
});

module.exports = logger;
