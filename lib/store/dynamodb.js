const {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  DeleteItemCommand,
  ScanCommand
} = require("@aws-sdk/client-dynamodb");

function toDynamoDBOpts(opts) {
  const dynamoDBOpts = Object.assign({}, opts);
  delete dynamoDBOpts.table;
  return dynamoDBOpts;
}

class DynamoDBAdapter {
  constructor(logger, opts) {
    this.client = new DynamoDBClient(toDynamoDBOpts(opts));
    this.table = opts.table;
  }

  async get(key, clientKey) {
    const res = await this.client.send(
      new GetItemCommand({
        TableName: this.table,
        Key: {
          clientKey: { S: clientKey },
          key: { S: key }
        },
        ConsistentRead: true
      })
    );

    const val = res.Item && res.Item.val && res.Item.val.S;

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

    await this.client.send(
      new PutItemCommand({
        TableName: this.table,
        Item: {
          clientKey: { S: clientKey },
          key: { S: key },
          val: { S: strVal },
          createdAt: { N: new Date().getTime().toString() }
        }
      })
    );
    return this.get(key, clientKey);
  }

  async del(key, clientKey) {
    await this.client.send(
      new DeleteItemCommand({
        TableName: this.table,
        Key: {
          clientKey: { S: clientKey },
          key: { S: key }
        }
      })
    );
  }

  async getAllClientInfos() {
    let res = {};
    let items = [];
    let params = {
      TableName: this.table,
      FilterExpression: "#key = :key",
      ExpressionAttributeNames: {
        "#key": "key"
      },
      ExpressionAttributeValues: {
        ":key": { S: "clientInfo" }
      }
    };
    do {
      res = await this.client.send(new ScanCommand(params));
      items = [].concat(items, res.Items);
      params = Object.assign({}, params);
      params.ExclusiveStartKey = res.LastEvaluatedKey;
    } while (typeof res.LastEvaluatedKey !== "undefined");

    return items
      .sort(
        (a, b) =>
          (a.createdAt && parseInt(a.createdAt.N, 10)) -
          (b.createdAt && parseInt(b.createdAt.N, 10))
      )
      .map(item => {
        const val = item.val && item.val.S;
        try {
          return JSON.parse(val);
        } catch (e) {
          return val;
        }
      });
  }

  isMemoryStore() {
    return false;
  }
}

module.exports = function (logger, opts) {
  if (arguments.length === 0) {
    return DynamoDBAdapter;
  }

  return new DynamoDBAdapter(logger, opts);
};
