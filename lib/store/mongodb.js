var _ = require('lodash');
var RSVP = require('rsvp');
var MongoClient = require("mongodb").MongoClient;

var CONNECTOR_OPTIONS = ["rs", "url", "logging", "collection", "database", "adapter"];

function MongoDbAdapter(logger, opts) {
    var self = this;
    _.bindAll(self, 'get', 'set', 'del', 'isMemoryStore', 'getAllClientInfos', '_get', '_mongoDbConnected');

    self.mongoDbClient = null;
    self.db = null;
    self.collection = null;


    self.settings = {
        // Backwards compatible way of determining connectionUrl
        connectionUrl: process.env["MONGODB_URI"] || process.env["DB_URL"] || opts.rs || opts.url,
        collectionName: opts.collection || "AddonSettings",
        databaseName: opts.database || undefined, // undefined means default to the one from connectionUrl

        // Prepare mongodb options
        mongoDbOpts: _.assign({useNewUrlParser: true, promiseLibrary: RSVP.Promise}, opts)
    };

    // Eliminate all options in opts for self class and pass along the rest to mongoclient
    CONNECTOR_OPTIONS.forEach(function (optName) {
        delete self.settings.mongoDbOpts[optName];
    }.bind(self));

    // Add logger
    if (opts.logging) {
        self.settings.mongoDbOpts.logger = logger;
    }

    self.connectionPromise = MongoClient
            .connect(self.settings.connectionUrl, self.settings.mongoDbOpts)
            .then(self._mongoDbConnected)
            .catch(function (err) {
                (logger || console).error('Could not establish MongoDB database connection: ' + err.toString());
                return RSVP.reject(err);
            });
}

MongoDbAdapter.prototype.isMemoryStore = function () {
    // Even if the mongoDB server was operating in in-memory mode, it’s not in the node process memory and won’t
    // disappear when the node service restarts, so from our perspective it’s still not an in-memory store
    return false;
};

MongoDbAdapter.prototype._mongoDbConnected = function (mongoDbClient) {
    var self = this;
    self.mongoDbClient = mongoDbClient;
    self.db = self.mongoDbClient.db(self.settings.databaseName);
    self.collection = self.db.collection(self.settings.collectionName);
    return RSVP.all([
        self.collection.createIndex({key: 1, clientKey: 1}, {unique: true}),
        self.collection.createIndex({key: 1})
    ]);
};

// run a query with an arbitrary 'where' clause
// returns an array of values
MongoDbAdapter.prototype._get = function (where) {
    var self = this;
    return self.connectionPromise.then(function () {
        return self.collection.find(where).toArray()
    }).then(function (resultsArray) {
        if (!resultsArray || !Array.isArray(resultsArray) || resultsArray.length === 0) {
            return [];
        }
        return resultsArray.map(function (entry) {
            return entry.val;
        });
    });
};

MongoDbAdapter.prototype.getAllClientInfos = function () {
    var self = this;
    return self._get({key: 'clientInfo'});
};

// return a promise to a single object identified by 'key' in the data belonging to tenant 'clientKey'
MongoDbAdapter.prototype.get = function (key, clientKey) {
    var self = this;
    if (typeof key !== 'string') {
        return RSVP.reject(new Error('The key for what to get in MongoDB must be a string'));
    }
    if (typeof clientKey !== 'string') {
        return RSVP.reject(new Error('The clientKey for what to get in MongoDB must be a string'));
    }
    return self.connectionPromise.then(function () {
        return self.collection.findOne({
            key: key,
            clientKey: clientKey
        })
    }).then(function (resultDoc) {
        if (resultDoc) {
            return resultDoc.val;
        } else {
            return null;
        }
    });
};

MongoDbAdapter.prototype.set = function (key, value, clientKey) {
    var self = this;
    if (typeof key !== 'string') {
        return RSVP.reject(new Error('The key for what to set in MongoDB must be a string'));
    }
    if (typeof clientKey !== 'string') {
        return RSVP.reject(new Error('The clientKey for what to set in MongoDB must be a string'));
    }
    value = getAsObject(value);
    return self.connectionPromise.then(function () {
        return self.collection.replaceOne({
            key: key,
            clientKey: clientKey
        }, {
            key: key,
            clientKey: clientKey,
            val: value
        }, {
            upsert: true
        })
    }).then(function () {
        return value;
    });
};

MongoDbAdapter.prototype.del = function (key, clientKey) {
    var self = this;
    var query;
    if (clientKey === undefined) {
        // try to interpret key as clientKey
        query = {
            clientKey: key
        };
    } else {
        query = {
            key: key,
            clientKey: clientKey
        };
    }

    // Type checks
    if (typeof query.clientKey !== 'string') {
        return RSVP.reject(new Error('The clientKey for what to delete from MongoDB must be a string'));
    }
    if (query.key !== undefined && typeof query.key !== 'string') {
        return RSVP.reject(new Error('The key for what to delete from MongoDB must be a string (or undefined if you ' +
                'want to delete all entries with the given clientKey)'));
    }

    return self.connectionPromise.then(function () {
        return self.collection.deleteMany(query);
    });
};

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

module.exports = function (logger, opts) {
    if (0 === arguments.length) {
        return MongoDbAdapter;
    }
    return new MongoDbAdapter(logger, opts);
};
