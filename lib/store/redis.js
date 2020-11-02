const redis = require("redis");
const util = require("util");

const REDIS_COMMANDS = ["get", "set", "del", "keys"];

const redisKey = (key, clientKey) => {
  return clientKey ? `${clientKey}:${key}` : key;
};

class RedisAdapter {
  constructor(logger, opts) {
    const redisClient = redis.createClient(process.env["DB_URL"] || opts.url);

    this.client = REDIS_COMMANDS.reduce((client, command) => {
      client[command] = util.promisify(redisClient[command]).bind(redisClient);
      return client;
    }, {});
  }

  async get(key, clientKey) {
    const val = await this.client.get(redisKey(key, clientKey));

    try {
      return JSON.parse(val);
    } catch (e) {
      return val;
    }
  }

  async set(key, val, clientKey) {
    let strVal = val;

    if (typeof val !== "string") {
      strVal = JSON.stringify(val);
    }

    await this.client.set(redisKey(key, clientKey), strVal);
    return this.get(key, clientKey);
  }

  async del(key, clientKey) {
    await this.client.del(redisKey(key, clientKey));
  }

  async getAllClientInfos() {
    const keys = await this.client.keys("*:clientInfo");

    return Promise.all(
      keys.map(key => {
        return this.get(key);
      })
    );
  }

  isMemoryStore() {
    return false;
  }
}

module.exports = function (logger, opts) {
  if (arguments.length === 0) {
    return RedisAdapter;
  }

  return new RedisAdapter(logger, opts);
};
