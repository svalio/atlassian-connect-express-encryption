const Sequelize = require("sequelize");

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
      opts.table || "AddonSetting",
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

    this.connectionPromise = AddonSettings.sync();

    this.settings = {
      logging: opts.logging,
      dialect: opts.dialect,
      storage: opts.storage,
      table: opts.table
    };
  }

  isMemoryStore() {
    const options = this.schema.options;
    return options.storage === ":memory:";
  }

  // run a query with an arbitrary 'where' clause
  // returns an array of values
  async _get(where) {
    const settings = await this.connectionPromise;
    const results = await settings.findAll({
      where
    });

    return results.map(result => {
      return getAsObject(result.get("val"));
    });
  }

  getAllClientInfos() {
    return this._get({ key: "clientInfo" });
  }

  // return a promise to a single object identified by 'key' in the data belonging to tenant 'clientKey'
  async get(key, clientKey) {
    const settings = await this.connectionPromise;
    const result = await settings.findOne({
      where: {
        key,
        clientKey
      }
    });

    return result ? getAsObject(result.get("val")) : null;
  }

  async set(key, value, clientKey) {
    const settings = await this.connectionPromise;

    // TODO Investigate using upsert for brevity:
    // https://community.developer.atlassian.com/t/i-found-a-bug-in-atlassian-connect-express-sequelize-storage-adapter-how-do-i-report-it/42399
    // https://ecosystem.atlassian.net/browse/ACEJS-161
    const [result, created] = await settings.findOrCreate({
      where: {
        key,
        clientKey
      },
      defaults: {
        val: value
      }
    });

    if (created) {
      return getAsObject(result.get("val"));
    }

    const updatedModel = await result.update({
      val: value
    });

    return getAsObject(updatedModel.get("val"));
  }

  async del(key, clientKey) {
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

    const settings = await this.connectionPromise;
    return settings.destroy({
      where: whereClause
    });
  }
}

module.exports = function (logger, opts) {
  if (arguments.length === 0) {
    return SequelizeAdapter;
  }
  return new SequelizeAdapter(logger, opts);
};
