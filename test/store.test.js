const helper = require("./test_helper");
const http = require("http");
const express = require("express");
const bodyParser = require("body-parser");
const request = require("request");
const RSVP = require("rsvp");
const Sequelize = require("sequelize");
const logger = require("./logger");
const sinon = require("sinon");
const MongodbMemoryServer = require("mongodb-memory-server").default;

describe.each([["sequelize"], ["mongodb"]])("Store %s", store => {
  const app = express();
  const ac = require("../index");
  let addon = {};

  const testContext = {};

  let server = {},
    dbServer = null;
  const oldACOpts = process.env.AC_OPTS;

  let storeGetSpy;
  let storeSetSpy;
  let storeDelSpy;

  beforeAll(done => {
    testContext.sandbox = sinon.createSandbox();
    process.env.AC_OPTS = "no-auth";
    app.set("env", "development");
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(bodyParser.json());

    app.get("/confluence/rest/plugins/1.0/", function(req, res) {
      res.setHeader("upm-token", "123");
      res.json({ plugins: [] });
      res.status(200).end();
    });

    // Post request to UPM installer
    app.post("/confluence/rest/plugins/1.0/", function(req, res) {
      request({
        url: helper.addonBaseUrl + "/installed",
        method: "POST",
        json: helper.installedPayload
      });
      res.status(200).end();
    });

    ac.store.register("teststore", function(logger, opts) {
      const Store = require("../lib/store/" + store)();
      storeGetSpy = testContext.sandbox.spy(Store.prototype, "get");
      storeSetSpy = testContext.sandbox.spy(Store.prototype, "set");
      storeDelSpy = testContext.sandbox.spy(Store.prototype, "del");
      return new Store(logger, opts);
    });

    let storeOptsPromise;
    switch (store) {
      case "sequelize":
        storeOptsPromise = RSVP.resolve({
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
        storeOptsPromise = dbServer
          .getConnectionString()
          .then(function(connectionString) {
            return {
              adapter: "teststore",
              url: connectionString
            };
          });
        break;
    }
    storeOptsPromise.then(function(storeOpts) {
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

      server = http
        .createServer(app)
        .listen(helper.addonPort, async function() {
          await addon.register();
          done();
        });
    });
  });

  afterAll(done => {
    testContext.sandbox.restore();
    process.env.AC_OPTS = oldACOpts;
    server.close();
    if (dbServer) {
      dbServer.stop();
    }
    done();
  });

  it("should store client info", async () => {
    return new Promise(resolve => {
      addon.on("host_settings_saved", async function() {
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
    await addon.settings.set("clientInfo", { correctPayload: true }, "fake");
    const clientInfos = await addon.settings.getAllClientInfos();
    expect(clientInfos).toHaveLength(initialClientInfos.length + 1);
    const latestClientInfo = clientInfos[clientInfos.length - 1];
    const correctPayload = latestClientInfo["correctPayload"];
    expect(correctPayload).toEqual(true);
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
        await RSVP.all(promises);
        expect(storeSetSpy.callCount).toBeGreaterThan(0);
        expect(storeGetSpy.callCount).toBeGreaterThan(0);
        expect(storeDelSpy.callCount).toBeGreaterThan(0);
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
});
