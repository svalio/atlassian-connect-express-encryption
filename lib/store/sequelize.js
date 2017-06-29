var _ = require('lodash');
var RSVP = require('rsvp');
var Sequelize = require("sequelize");

var connectionPromise;

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
 * Make sure we accept JugglingDB style opts (e.g. opts.type)
 * @param opts the raw opts object
 * @returns {Object} the Sequelize style opts object
 */
function toSequelizeOpts(opts) {
  if(opts.type) {
    if(opts.type === "memory") {
        opts.dialect = 'sqlite';
        opts.storage = ':memory:';
    } else {
      opts.dialect = opts.type;
    }
    delete opts.type;
  }

  return opts;
}

function SequelizeAdapter(logger, opts) {
  var self = this;
  var sequelize;

  opts = toSequelizeOpts(opts);
  opts.logging = (opts.logging !== false ? logger.info : false);
  if(opts.dialect && opts.dialect === 'sqlite' && opts.storage) {
    sequelize = self.schema = new Sequelize(null, null, null, opts);
  } else {
    sequelize = self.schema = new Sequelize(process.env["DB_URL"] || opts.url, {
      logging: opts.logging
    });
  }

  var AddonSettings = sequelize.define('AddonSetting', {
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
  }, {
    indexes: [{
      fields: ["clientKey", "key"]
    }],
    timestamps: false
  });

  connectionPromise = new RSVP.Promise(function(resolve, reject) {
    AddonSettings.sync().then(resolve).catch(reject);
  });

  _.bindAll(this, 'get', 'set', 'del');
}

var proto = SequelizeAdapter.prototype;

proto.isMemoryStore = function () {
  var options = this.schema.options;
  return options.storage === ":memory:";
};

// run a query with an arbitrary 'where' clause
// returns an array of values
proto._get = function (where) {
  return connectionPromise.then(function(AddonSettings) {
    return new RSVP.Promise(function(resolve, reject) {
      AddonSettings.findAll({
        where: where
      }).then(function(results) {
        return resolve(_.map(results, function(result) {
          return result.get({
            plain: true
          });
        }));
      }).catch(reject);
    });
  });
};

proto.getAllClientInfos = function () {
  return this._get({key: 'clientInfo'}).then(function(results) {
    return !Array.isArray(results) ? [] : results.map(function(v) {
      return getAsObject(v.val);
    });
  });
};

// return a promise to a single object identified by 'key' in the data belonging to tenant 'clientKey'
proto.get = function (key, clientKey) {
  return connectionPromise.then(function(AddonSettings) {
    return new RSVP.Promise(function(resolve, reject) {
      AddonSettings.findOne({
        where: {
          key: key,
          clientKey: clientKey
        }
      }).then(function (result) {
        resolve(result ? getAsObject(result.get("val")) : null);
      }).catch(reject);
    });
  });
};

proto.set = function (key, value, clientKey) {
  return connectionPromise.then(function(AddonSettings) {
    return new RSVP.Promise(function(resolve, reject) {
      AddonSettings.findOrCreate({
        where: {
          key: key,
          clientKey: clientKey
        },
        defaults: {
          val: value
        }
      }).spread(function (result, created) {
        if (!created) {
          return result.update({
            val: value
          }).then(function(updatedModel) {
            return resolve(getAsObject(updatedModel.get("val")));
          }).catch(reject);
        } else {
          return resolve(getAsObject(result.get("val")));
        }
      }).catch(reject);
    })
  });
};

proto.del = function (key, clientKey) {
  var whereClause;
  if (arguments.length < 2) {
    whereClause = {
      clientKey: key
    };
  } else {
    whereClause = {
      key: key,
      clientKey: clientKey
    };
  }

  return connectionPromise.then(function(AddonSettings) {
    return new RSVP.Promise(function(resolve, reject) {
      AddonSettings.destroy({
        where: whereClause
      }).then(resolve).catch(reject);
    });
  });
};

module.exports = function (logger, opts) {
  if (0 == arguments.length) {
    return SequelizeAdapter;
  }
  return new SequelizeAdapter(logger, opts);
};
