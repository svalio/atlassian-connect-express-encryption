const inspect = require("util").inspect;
const _ = require("lodash");
require("colors");

const nodeEnv = process.env.NODE_ENV;
const devEnv = !nodeEnv || nodeEnv === "development";

const ops = { info: "grey", warn: "yellow", error: "red" };

module.exports = _.fromPairs(
  _.map(_.keys(ops), op => {
    return [
      op,
      function () {
        const args = [].slice.call(arguments);
        console[op].apply(
          console,
          args.map(arg => {
            const s = _.isObject(arg)
              ? inspect(arg, { colors: devEnv })
              : new String(arg).toString();
            return devEnv ? s[ops[op]].bold : s;
          })
        );
      }
    ];
  })
);
