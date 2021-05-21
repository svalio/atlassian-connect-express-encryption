const jwt = require("atlassian-jwt");
const bodyParser = require("body-parser");
const express = require("express");
const http = require("http");
const request = require("request");
const moment = require("moment");
const nock = require("nock");
const logger = require("./logger");
const requireOptional = require("../lib/internal/require-optional");
const jiraGlobalSchema = require("./jira-global-schema");
const helper = require("./test_helper");
const ac = require("../index");

// Helps failures be reported to the test framework
process.on("unhandledRejection", err => {
  throw err;
});

describe("Auto registration (UPM)", () => {
  let requireOptionalStub;
  let requestGetStub;
  let server;
  let app;
  let addon;

  beforeEach(() => {
    requireOptionalStub = jest.spyOn(requireOptional, "requireOptional");
    app = express();
    addon = {};

    app.set("env", "development");
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(bodyParser.json());

    app.get("/rest/plugins/1.0/", (req, res) => {
      res.setHeader("upm-token", "123");
      res.json({ plugins: [] });
      res.status(200).end();
    });

    // Post request to UPM installer
    app.post("/confluence/rest/plugins/1.0/", (req, res) => {
      request({
        url: `${helper.addonBaseUrl}/installed`,
        qs: {
          jwt: createJwtToken()
        },
        method: "POST",
        json: helper.installedPayload
      });
      res.status(200).end();
    });

    app.delete(/plugins\/1.0\/(.*?)-key/, (req, res) => {
      res.status(200).end();
    });

    ac.store.register("teststore", (logger, opts) => {
      return require("../lib/store/sequelize")(logger, opts);
    });

    nock("https://developer.atlassian.com")
      .get("/static/connect/docs/latest/schema/jira-global-schema.json")
      .reply(200, jiraGlobalSchema);
  });

  afterEach(() => {
    delete process.env.AC_LOCAL_BASE_URL;
    requireOptionalStub.mockRestore();
    if (requestGetStub) {
      requestGetStub.mockRestore();
    }
    if (server) {
      server.close();
    }
  });

  function createJwtToken() {
    const jwtPayload = {
      iss: helper.installedPayload.clientKey,
      iat: moment().utc().unix(),
      exp: moment().utc().add(10, "minutes").unix()
    };

    return jwt.encodeSymmetric(
      jwtPayload,
      helper.installedPayload.sharedSecret
    );
  }

  function createAddon(hosts) {
    addon = ac(
      app,
      {
        config: {
          development: {
            store: {
              adapter: "teststore",
              type: "memory"
            },
            hosts
          }
        }
      },
      logger
    );
  }

  function startServer(cb) {
    server = http.createServer(app).listen(helper.addonPort, cb);
  }

  // eslint-disable-next-line no-unused-vars
  function stubInstalledPluginsResponse(key) {
    requestGetStub = jest.spyOn(request, "get");
    requestGetStub.mockImplementation((reqObject, callback) => {
      callback(
        null,
        null,
        JSON.stringify({
          plugins: [
            {
              key: "my-test-app-key"
            }
          ]
        })
      );
    });
  }

  function stubNgrokV2() {
    requireOptionalStub.mockReturnValue(
      Promise.resolve({
        // eslint-disable-next-line no-unused-vars
        connect(port, cb) {
          return undefined;
        }
      })
    );
  }

  function stubNgrokWorking() {
    requireOptionalStub.mockReturnValue(
      Promise.resolve({
        // eslint-disable-next-line no-unused-vars
        connect(port) {
          return Promise.resolve("https://test.ngrok.io");
        }
      })
    );
  }

  // eslint-disable-next-line no-unused-vars
  function stubNgrokUnavailable() {
    const error = new Error(
      "Cannot find module 'ngrok' (no worries, this error is thrown on purpose by stubNgrokUnavailable in test)"
    );
    error.code = "MODULE_NOT_FOUND";
    requireOptionalStub.returns(Promise.reject(error));
  }

  it("registration works with local host and does not involve ngrok", async () => {
    createAddon([helper.productBaseUrl]);
    return new Promise(resolve => {
      startServer(async () => {
        await addon.register();
        expect(requireOptionalStub).not.toHaveBeenCalled();
        resolve();
      });
    });
  });

  it("registration works with remote host via ngrok", async () => {
    stubNgrokWorking();
    stubInstalledPluginsResponse("my-test-app-key");

    createAddon(["http://admin:admin@example.atlassian.net/wiki"]);

    await addon.register();
    expect(requireOptionalStub).toHaveBeenCalled();
  });

  it("registration does not work with ngrok 2.x (error will print to console)", async () => {
    stubNgrokV2();
    stubInstalledPluginsResponse("my-test-app-key");

    createAddon(["http://admin:admin@example.atlassian.net/wiki"]);

    await expect(async () => {
      await addon.register();
    }).rejects.toThrow();
    expect(requireOptionalStub).toHaveBeenCalled();
  });

  it("validator works with an invalid connect descriptor", async () => {
    createAddon([helper.productBaseUrl]);
    addon.descriptor = {
      key: "my-test-app-key",
      name: "My Test App Name",
      baseUrl: "http://something",
      description: "My test app description.",
      apiMigrtios: { gdpr: true }
    };

    const results = await addon.validateDescriptor();
    expect(results.length).toBeGreaterThan(0);
  });

  it("validator works with a valid connect descriptor", async () => {
    createAddon([helper.productBaseUrl]);
    addon.descriptor = {
      key: "my-test-app-key",
      name: "My Test App Name",
      description: "My test app description.",
      baseUrl: "https://ngrok.io",
      authentication: { type: "jwt" },
      modules: {
        generalPages: [
          {
            key: "hello-world-page-jira",
            location: "system.top.navigation.bar",
            name: {
              value: "Hello World"
            },
            url: "/hello-world"
          }
        ]
      }
    };

    const results = await addon.validateDescriptor();
    expect(results.length).toEqual(0);
  });
});
