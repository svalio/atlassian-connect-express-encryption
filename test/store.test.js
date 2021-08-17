const helper = require("./test_helper");
const http = require("http");
const express = require("express");
const bodyParser = require("body-parser");
const request = require("request");
const Sequelize = require("sequelize");
const logger = require("./logger");
const redis = require("redis");
const redisMock = require("redis-mock");
const MongodbMemoryServer = require("mongodb-memory-server").default;
const {
  DynamoDBClient,
  CreateTableCommand
} = require("@aws-sdk/client-dynamodb");
const waitOn = require("wait-on");
const DynamoDbLocal = require("dynamodb-local");

DynamoDbLocal.configureInstaller({
  installPath: "./dynamodblocal-bin"
});

describe.each([["sequelize"], ["mongodb"], ["redis"], ["dynamodb"]])(
  "Store %s",
  store => {
    const app = express();
    const ac = require("../index");
    let addon;
    let server = {};
    let dbServer = null;
    const oldACOpts = process.env.AC_OPTS;

    let redisCreateClientSpy;
    let storeGetSpy;
    let storeSetSpy;
    let storeDelSpy;

    let dynamodbChild;

    // we set a timeout of 60 seconds for mongodb and dynamodb so that during
    // the very first test run it has time to download the binaries, otherwise
    // the test will always fail.
    const timeout = ["mongodb", "dynamodb"].includes(store) ? 60000 : 5000;

    beforeAll(async () => {
      redisCreateClientSpy = jest
        .spyOn(redis, "createClient")
        .mockImplementation(redisMock.createClient);

      process.env.AC_OPTS = "no-auth";
      app.set("env", "development");
      app.use(bodyParser.urlencoded({ extended: false }));
      app.use(bodyParser.json());

      app.get("/confluence/rest/plugins/1.0/", (req, res) => {
        res.setHeader("upm-token", "123");
        res.json({ plugins: [] });
        res.status(200).end();
      });

      // Post request to UPM installer
      app.post("/confluence/rest/plugins/1.0/", (req, res) => {
        request({
          url: `${helper.addonBaseUrl}/installed`,
          method: "POST",
          json: helper.installedPayload
        });
        res.status(200).end();
      });

      ac.store.register("teststore", (logger, opts) => {
        const Store = require(`../lib/store/${store}`)();
        storeGetSpy = jest.spyOn(Store.prototype, "get");
        storeSetSpy = jest.spyOn(Store.prototype, "set");
        storeDelSpy = jest.spyOn(Store.prototype, "del");
        return new Store(logger, opts);
      });

      let storeOptsPromise;
      const dynamoDBTable = "DynamoDB-AddonSettings";
      const dynamoDBOpts = {
        endpoint: "http://localhost:8000",
        region: "localhost",
        credentials: {
          accessKeyId: "dummy",
          secretAccessKey: "dummy"
        }
      };
      switch (store) {
        case "sequelize":
          storeOptsPromise = Promise.resolve({
            adapter: "teststore",
            type: "memory"
          });
          break;
        case "mongodb":
          // Prepare an in-memory database for this test
          dbServer = new MongodbMemoryServer({
            // debug: true // this is fairly verbose
            binary: {
              version: "3.6.9"
            }
          });
          storeOptsPromise = dbServer.getUri().then(connectionString => ({
            adapter: "teststore",
            url: connectionString
          }));
          break;
        case "redis":
          storeOptsPromise = Promise.resolve({
            adapter: "teststore",
            url: "redis://localhost:6379"
          });
          break;
        case "dynamodb":
          dynamodbChild = await DynamoDbLocal.launch(
            8000,
            null,
            [],
            false,
            true
          );
          await waitOn({
            resources: [dynamoDBOpts.endpoint],
            validateStatus: status => status === 400
          });
          await new DynamoDBClient(dynamoDBOpts).send(
            new CreateTableCommand({
              AttributeDefinitions: [
                {
                  AttributeName: "clientKey",
                  AttributeType: "S"
                },
                {
                  AttributeName: "key",
                  AttributeType: "S"
                }
              ],
              KeySchema: [
                {
                  AttributeName: "clientKey",
                  KeyType: "HASH"
                },
                {
                  AttributeName: "key",
                  KeyType: "RANGE"
                }
              ],
              BillingMode: "PAY_PER_REQUEST",
              TableName: dynamoDBTable
            })
          );
          storeOptsPromise = Promise.resolve(
            Object.assign(
              {
                adapter: "teststore",
                table: dynamoDBTable
              },
              dynamoDBOpts
            )
          );
          break;
      }
      return storeOptsPromise.then(storeOpts => {
        addon = ac(
          app,
          {
            config: {
              development: {
                store: storeOpts,
                hosts: [helper.productBaseUrl]
              }
            }
          },
          logger
        );

        server = http.createServer(app).listen(helper.addonPort, async () => {
          await addon.register();
        });
      });
    }, timeout);

    afterAll(() => {
      redisCreateClientSpy.mockRestore();
      storeGetSpy.mockRestore();
      storeSetSpy.mockRestore();
      storeDelSpy.mockRestore();

      process.env.AC_OPTS = oldACOpts;
      server.close();
      if (dbServer) {
        dbServer.stop();
      }
      if (dynamodbChild) {
        DynamoDbLocal.stopChild(dynamodbChild);
      }
    });

    it("should store client info", async () => {
      return new Promise(resolve => {
        addon.on("host_settings_saved", async () => {
          const settings = await addon.settings.get(
            "clientInfo",
            helper.installedPayload.clientKey
          );

          expect(settings.clientKey).toEqual(helper.installedPayload.clientKey);
          expect(settings.sharedSecret).toEqual(
            helper.installedPayload.sharedSecret
          );
          resolve();
        });
      });
    });

    it("should return a list of clientInfo objects", async () => {
      const initialClientInfos = await addon.settings.getAllClientInfos();

      await addon.settings.set(
        "clientInfo",
        { correctPayload: true },
        "clientKey-list-test"
      );
      const clientInfos = await addon.settings.getAllClientInfos();
      expect(clientInfos).toHaveLength(initialClientInfos.length + 1);

      const latestClientInfo = clientInfos[clientInfos.length - 1];
      const correctPayload = latestClientInfo["correctPayload"];
      expect(correctPayload).toEqual(true);
    });

    it("should update for existing key-clientKey pair", async () => {
      const initialClientInfos = await addon.settings.getAllClientInfos();

      const setting1 = await addon.settings.set(
        "clientInfo",
        { correctPayload1: true },
        "clientKey-update-test"
      );
      const setting2 = await addon.settings.set(
        "clientInfo",
        { correctPayload2: false },
        "clientKey-update-test"
      );
      const clientInfos = await addon.settings.getAllClientInfos();
      expect(clientInfos).toHaveLength(initialClientInfos.length + 1);
      expect(setting1).toEqual({ correctPayload1: true });
      expect(setting2).toEqual({ correctPayload2: false });

      const latestClientInfo = clientInfos[clientInfos.length - 1];
      expect(latestClientInfo["correctPayload1"]).toEqual(undefined);
      expect(latestClientInfo["correctPayload2"]).toEqual(false);
    });

    it("should allow storing arbitrary key/values as a JSON string", async () => {
      const value = '{"someKey": "someValue"}';
      const setting = await addon.settings.set(
        "arbitrarySetting",
        value,
        helper.installedPayload.clientKey
      );
      expect(setting).toEqual({ someKey: "someValue" });
    });

    it("should allow storing arbitrary key/values as object", async () => {
      const setting = await addon.settings.set(
        "arbitrarySetting2",
        { data: 1 },
        helper.installedPayload.clientKey
      );
      expect(setting).toEqual({ data: 1 });
    });

    it("should allow storing arbitrary key/values", async () => {
      const value = "barf";
      const setting = await addon.settings.set(
        "arbitrarySetting3",
        value,
        helper.installedPayload.clientKey
      );
      expect(setting).toEqual("barf");
    });

    switch (store) {
      case "sequelize": {
        it(`should allow storage of arbitrary models [${store}]`, async () => {
          const User = addon.schema.define("User", {
            id: {
              type: Sequelize.INTEGER,
              autoIncrement: true,
              primaryKey: true
            },
            name: { type: Sequelize.STRING },
            email: { type: Sequelize.STRING },
            bio: { type: Sequelize.JSON }
          });

          await addon.schema.sync();
          const model = await User.create({
            name: "Rich",
            email: "rich@example.com",
            bio: {
              description: "Male 6' tall",
              favoriteColors: ["blue", "green"]
            }
          });
          expect(model.name).toEqual("Rich");
          const user = await User.findAll({ name: "Rich" });
          expect(user[0].name).toEqual(model.name);
        });

        it("should work with a custom store", async () => {
          const promises = [
            addon.settings.set(
              "custom key",
              { customKey: "custom value" },
              helper.installedPayload.clientKey
            ),
            addon.settings.get("custom key", helper.installedPayload.clientKey),
            addon.settings.del("custom key", helper.installedPayload.clientKey)
          ];
          await Promise.all(promises);
          expect(storeSetSpy).toHaveBeenCalled();
          expect(storeGetSpy).toHaveBeenCalled();
          expect(storeDelSpy).toHaveBeenCalled();
        });
        break;
      }
      case "mongodb": {
        it("should not allow storing a non-string key", async () => {
          const value = "barf";
          await expect(async () => {
            await addon.settings.set(
              42,
              value,
              helper.installedPayload.clientKey
            );
          }).rejects.toThrow();
        });

        it("should not allow deleting a non-string key", async () => {
          await expect(async () => {
            await addon.settings.del(42, helper.installedPayload.clientKey);
          }).rejects.toThrow();
        });

        it("should not allow storing a non-string clientKey", async () => {
          const value = "barf";
          await expect(async () => {
            await addon.settings.set("additionalSetting4", value, 42);
          }).rejects.toThrow();
        });

        it("should not allow deleting a non-string clientKey", async () => {
          await expect(async () => {
            await addon.settings.del("additionalSetting4", 42);
          }).rejects.toThrow();
        });

        it("should allow an empty string key and value", async () => {
          const setting = await addon.settings.set(
            "",
            "",
            helper.installedPayload.clientKey
          );
          expect(setting).toEqual("");
          const getSetting = await addon.settings.get(
            "",
            helper.installedPayload.clientKey
          );
          expect(getSetting).toEqual("");
        });
        break;
      }
    }
  }
);
