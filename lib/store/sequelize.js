var _ = require('lodash');
var RSVP = require('rsvp');
var Sequelize = require("sequelize");

var connectionPromise;

function getAsObject(val) {
  if (typeof val === "string") {
    try {
      val = JSON.parse(val);
    } catch (e) {
      console.error("Could not parse val", e);
    }
  }

  return val;
}

function SequelizeAdapter(logger, opts) {
  var sequelize = new Sequelize(process.env["DB_URL"] || opts.url, {
    logging: logger.info
  });

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
    }]
  });

  connectionPromise = new RSVP.Promise(function(resolve, reject) {
    AddonSettings.sync().then(resolve).catch(reject);
  });

  _.bindAll(this, 'get', 'set', 'del');
}

var proto = SequelizeAdapter.prototype;

proto.isMemoryStore = function () {
  return false;
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
  return this.get('clientInfo');
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
        resolve(getAsObject(result.get("val")));
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


