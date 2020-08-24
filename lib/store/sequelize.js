const _ = require("lodash");
const Sequelize = require("sequelize");

let connectionPromise;

function getAsObject(val) {
  if (typeof val === "string") {
    try {
      val = JSON.parse(val);
    } catch (e) {
      // it's OK if we can't parse this. We'll just return the string below.
    }
  }

  return val;
}

/**
 * Make sure we accept JugglingDB style opts (e.g. opts.type).
 *
 * This is mostly to allow for old code written with ACE to continue to work with Sequelize.
 * @param opts the raw opts object
 * @returns {Object} the Sequelize style opts object
 */
function toSequelizeOpts(opts) {
  if (opts.type) {
    if (opts.type === "memory") {
      opts.dialect = "sqlite";
      opts.storage = ":memory:";
    } else {
      opts.dialect = opts.type;
    }
    delete opts.type;
  }

  return opts;
}

class SequelizeAdapter {
  constructor(logger, opts) {
    const self = this;
    let sequelize;

    opts = toSequelizeOpts(opts);
    opts.logging = opts.logging !== false ? logger.info : false;
    if (opts.dialect && opts.dialect === "sqlite" && opts.storage) {
      sequelize = self.schema = new Sequelize(null, null, null, opts);
    } else {
      const sequelizeOpts = {
        logging: opts.logging,
        pool: opts.pool
      };

      if (opts.dialectOptions) {
        sequelizeOpts.dialectOptions = opts.dialectOptions;
      }

      console.log(sequelizeOpts);

      sequelize = self.schema = new Sequelize(
        process.env["DB_URL"] || opts.url,
        sequelizeOpts
      );
    }

    const AddonSettings = sequelize.define(
      "AddonSetting",
      {
        clientKey: {
          type: Sequelize.STRING,
          allowNull: true
        },
        key: {
          type: Sequelize.STRING,
          allowNull: true
        },
        val: {
          type: Sequelize.JSON,
          allowNull: true
        }
      },
      {
        indexes: [
          {
            fields: ["clientKey", "key"]
          }
        ],
        timestamps: false
      }
    );

    connectionPromise = new Promise((resolve, reject) => {
      AddonSettings.sync().then(resolve).catch(reject);
    });

    this.settings = {
      logging: opts.logging,
      dialect: opts.dialect,
      storage: opts.storage
    };

    _.bindAll(this, "get", "set", "del");
  }

  isMemoryStore() {
    const options = this.schema.options;
    return options.storage === ":memory:";
  }

  // run a query with an arbitrary 'where' clause
  // returns an array of values
  _get(where) {
    return connectionPromise.then(AddonSettings => {
      return new Promise((resolve, reject) => {
        AddonSettings.findAll({
          where
        })
          .then(results => {
            return resolve(
              results.map(result => {
                return getAsObject(result.get("val"));
              })
            );
          })
          .catch(reject);
      });
    });
  }

  getAllClientInfos() {
    return this._get({ key: "clientInfo" });
  }

  // return a promise to a single object identified by 'key' in the data belonging to tenant 'clientKey'
  get(key, clientKey) {
    return connectionPromise.then(AddonSettings => {
      return new Promise((resolve, reject) => {
        AddonSettings.findOne({
          where: {
            key,
            clientKey
          }
        })
          .then(result => {
            resolve(result ? getAsObject(result.get("val")) : null);
          })
          .catch(reject);
      });
    });
  }

  set(key, value, clientKey) {
    return connectionPromise.then(AddonSettings => {
      return new Promise((resolve, reject) => {
        AddonSettings.findOrCreate({
          where: {
            key,
            clientKey
          },
          defaults: {
            val: value
          }
        })
          .spread((result, created) => {
            if (!created) {
              return result
                .update({
                  val: value
                })
                .then(updatedModel => {
                  return resolve(getAsObject(updatedModel.get("val")));
                })
                .catch(reject);
            } else {
              return resolve(getAsObject(result.get("val")));
            }
          })
          .catch(reject);
      });
    });
  }

  del(key, clientKey) {
    let whereClause;
    if (arguments.length < 2) {
      whereClause = {
        clientKey: key
      };
    } else {
      whereClause = {
        key,
        clientKey
      };
    }

    return connectionPromise.then(AddonSettings => {
      return new Promise((resolve, reject) => {
        AddonSettings.destroy({
          where: whereClause
        })
          .then(resolve)
          .catch(reject);
      });
    });
  }
}

module.exports = function (logger, opts) {
  if (arguments.length === 0) {
    return SequelizeAdapter;
  }
  return new SequelizeAdapter(logger, opts);
};
