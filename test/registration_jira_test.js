const helper = require("./test_helper");
const assert = require("assert");
const http = require("http");
const express = require("express");
const bodyParser = require("body-parser");
const ac = require("../index");
const request = require("request");
const jwt = require("atlassian-jwt");
const logger = require("./logger");
const moment = require("moment");
const sinon = require("sinon");
const RSVP = require("rsvp");
const requireOptional = require("../lib/internal/require-optional");
const jiraGlobalSchema = require("./jira-global-schema");
const nock = require("nock");

// Helps failures be reported to the test framework
RSVP.on("error", function(err) {
  throw err;
});

describe("Auto registration (UPM)", function() {
  let requireOptionalStub;
  let requestGetStub;
  let server;
  let app;
  let addon;

  beforeEach(function() {
    requireOptionalStub = sinon.stub(requireOptional, "requireOptional");
    app = express();
    addon = {};

    app.set("env", "development");
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(bodyParser.json());

    app.get("/rest/plugins/1.0/", function(req, res) {
      res.setHeader("upm-token", "123");
      res.json({ plugins: [] });
      res.status(200).end();
    });

    // Post request to UPM installer
    app.post("/confluence/rest/plugins/1.0/", function(req, res) {
      request({
        url: helper.addonBaseUrl + "/installed",
        qs: {
          jwt: createJwtToken()
        },
        method: "POST",
        json: helper.installedPayload
      });
      res.status(200).end();
    });

    app.delete(/plugins\/1.0\/(.*?)-key/, function(req, res) {
      res.status(200).end();
    });

    ac.store.register("teststore", function(logger, opts) {
      return require("../lib/store/sequelize")(logger, opts);
    });

    nock("https://developer.atlassian.com")
      .get("/static/connect/docs/latest/schema/jira-global-schema.json")
      .reply(200, jiraGlobalSchema);
  });

  afterEach(function(done) {
    delete process.env.AC_LOCAL_BASE_URL;
    requireOptionalStub.restore();
    if (requestGetStub) {
      requestGetStub.restore();
    }
    if (server) {
      server.close();
    }
    done();
  });

  function createJwtToken() {
    const jwtPayload = {
      iss: helper.installedPayload.clientKey,
      iat: moment()
        .utc()
        .unix(),
      exp: moment()
        .utc()
        .add(10, "minutes")
        .unix()
    };

    return jwt.encode(jwtPayload, helper.installedPayload.sharedSecret);
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
    requestGetStub = sinon.stub(request, "get");
    requestGetStub.callsArgWith(
      1,
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
  }

  function stubNgrokV2() {
    requireOptionalStub.returns(
      RSVP.resolve({
        // eslint-disable-next-line no-unused-vars
        connect: function(port, cb) {
          return undefined;
        }
      })
    );
  }

  function stubNgrokWorking() {
    requireOptionalStub.returns(
      RSVP.resolve({
        // eslint-disable-next-line no-unused-vars
        connect: function(port) {
          return RSVP.resolve("https://test.ngrok.io");
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
    requireOptionalStub.returns(RSVP.reject(error));
  }

  it("registration works with local host and does not involve ngrok", function(done) {
    createAddon([helper.productBaseUrl]);
    startServer(function() {
      addon.register().then(function() {
        assert(requireOptionalStub.notCalled, "ngrok should not be called");
        done();
      }, done);
    });
  }).timeout(1000);

  it("registration works with remote host via ngrok", function(done) {
    stubNgrokWorking();
    stubInstalledPluginsResponse("my-test-app-key");

    createAddon(["http://admin:admin@example.atlassian.net/wiki"]);

    addon.register().then(function() {
      assert(requireOptionalStub.called, "ngrok should be called");
      done();
    });
  }).timeout(1000);

  it("registration does not work with ngrok 2.x (error will print to console)", function(done) {
    stubNgrokV2();
    stubInstalledPluginsResponse("my-test-app-key");

    createAddon(["http://admin:admin@example.atlassian.net/wiki"]);

    addon
      .register()
      .then(function() {
        assert.fail("ngrok should not have succeeded");
        done();
      })
      .catch(function() {
        assert(requireOptionalStub.called, "ngrok should be called");
        done();
      });
  }).timeout(1000);

  it("validator works with an invalid connect descriptor", function(done) {
    createAddon([helper.productBaseUrl]);
    addon.descriptor = {
      key: "my-test-app-key",
      name: "My Test App Name",
      description: "My test app description.",
      apiMigrtios: { gdpr: true }
    };

    addon.validateDescriptor().then(function(results) {
      assert(results.length > 0, "should invalidate app descriptor");
      done();
    });
  }).timeout(1000);

  it("validator works with a valid connect descriptor", function(done) {
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

    addon.validateDescriptor().then(function(results) {
      assert.strictEqual(results.length, 0);
      done();
    });
  }).timeout(1000);
});
