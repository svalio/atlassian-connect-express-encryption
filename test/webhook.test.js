const jwt = require("atlassian-jwt");
const bodyParser = require("body-parser");
const express = require("express");
const http = require("http");
const moment = require("moment");
const helper = require("./test_helper");
const ac = require("../index");
const request = require("request");
const logger = require("./logger");
const nock = require("nock");

describe("Webhook", () => {
  const app = express();
  let addon = {};
  let server;
  let hostServer;
  let addonRegistered = false;

  beforeAll(() => {
    nock("https://connect-install-keys.atlassian.com")
      .persist()
      .get(`/${helper.keyId}`)
      .reply(200, helper.publicKey);

    ac.store.register("teststore", (logger, opts) => {
      return require("../lib/store/sequelize")(logger, opts);
    });

    app.set("env", "development");
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(bodyParser.json());

    const installedPayload = helper.installedPayload;
    installedPayload.baseUrl = "http://admin:admin@localhost:3003";

    addon = ac(
      app,
      {
        config: {
          development: {
            store: {
              adapter: "teststore",
              type: "memory"
            },
            hosts: [installedPayload.baseUrl],
            localBaseUrl: helper.addonBaseUrl
          }
        }
      },
      logger
    );

    const host = express();
    // mock host
    host.get("/rest/plugins/1.0/", (req, res) => {
      res.setHeader("upm-token", "123");
      res.json({ plugins: [] });
    });

    host.post("/rest/plugins/1.0/", (req, res) => {
      request({
        url: `${helper.addonBaseUrl}/installed`,
        qs: {
          jwt: helper.createJwtTokenForInstall({
            method: "POST",
            path: "/installed"
          })
        },
        method: "POST",
        json: installedPayload
      });
      res.status(200).end();
    });

    return new Promise(resolve => {
      hostServer = http.createServer(host).listen(3003, () => {
        server = http.createServer(app).listen(helper.addonPort, async () => {
          addon.once("host_settings_saved", () => {
            addonRegistered = true;
          });
          await addon.register();
          resolve();
        });
      });
    });
  });

  afterAll(() => {
    server.close();
    hostServer.close();
  });

  function createValidJwtToken(req) {
    const jwtPayload = {
      iss: helper.installedPayload.clientKey,
      iat: moment().utc().unix(),
      exp: moment().utc().add(10, "minutes").unix()
    };

    if (req) {
      jwtPayload.qsh = jwt.createQueryStringHash(jwt.fromExpressRequest(req));
    }

    return jwt.encodeSymmetric(
      jwtPayload,
      helper.installedPayload.sharedSecret
    );
  }

  function createExpiredJwtToken(req) {
    const jwtPayload = {
      iss: helper.installedPayload.clientKey,
      iat: moment().utc().subtract(20, "minutes").unix(),
      exp: moment().utc().subtract(10, "minutes").unix()
    };

    if (req) {
      jwtPayload.qsh = jwt.createQueryStringHash(jwt.fromExpressRequest(req));
    }

    return jwt.encodeSymmetric(
      jwtPayload,
      helper.installedPayload.sharedSecret
    );
  }

  function fireTestWebhook(route, body, assertWebhookResult, createJwtToken) {
    const url = helper.addonBaseUrl + route;

    const waitForRegistrationThenFireWebhook = function () {
      if (addonRegistered) {
        fireWebhook();
      } else {
        setTimeout(waitForRegistrationThenFireWebhook, 50);
      }
    };

    const requestMock = {
      method: "post",
      path: route,
      query: {
        user_id: "admin"
      }
    };

    const fireWebhook = function () {
      request.post(
        {
          url,
          qs: {
            user_id: "admin",
            jwt: createJwtToken
              ? createJwtToken(requestMock)
              : createValidJwtToken(requestMock)
          },
          json: body
        },
        assertWebhookResult
      );
    };

    waitForRegistrationThenFireWebhook();
  }

  function assertCorrectWebhookResult(err, res) {
    expect(err).toBeNull();
    expect(res.statusCode).toEqual(204);
  }

  it("should fire an add-on event", () => {
    const first = new Promise(resolve => {
      addon.once("plugin_test_hook", (event, body, req) => {
        expect(event).toEqual("plugin_test_hook");
        expect(body.foo).toEqual("bar");
        expect(req.query["user_id"]).toEqual("admin");
        resolve();
      });
    });

    const second = new Promise(resolve => {
      fireTestWebhook("/test-hook", { foo: "bar" }, (err, res) => {
        assertCorrectWebhookResult(err, res);
        resolve();
      });
    });

    return Promise.all([first, second]);
  });

  it("should perform auth verification for webhooks", () => {
    const triggered = jest.fn();
    addon.once("webhook_auth_verification_triggered", triggered);
    const successful = jest.fn();
    addon.once("webhook_auth_verification_successful", successful);

    const first = new Promise(resolve => {
      addon.once("plugin_test_hook", () => {
        expect(triggered).toHaveBeenCalled();
        expect(successful).toHaveBeenCalled();
        resolve();
      });
    });

    const second = new Promise(resolve => {
      fireTestWebhook("/test-hook", { foo: "bar" }, (err, res) => {
        assertCorrectWebhookResult(err, res);
        resolve();
      });
    });

    return Promise.all([first, second]);
  });

  it("webhook with expired JWT claim should not be processed", () => {
    const triggered = jest.fn();
    const successful = jest.fn();
    addon.once("webhook_auth_verification_triggered", triggered);
    addon.once("webhook_auth_verification_successful", successful);

    return new Promise(resolve => {
      fireTestWebhook(
        "/test-hook",
        { foo: "bar" },
        (err, res, body) => {
          expect(err).toBeNull();
          expect(res.statusCode).toEqual(401);
          expect(body.message).toEqual(
            "Authentication request has expired. Try reloading the page."
          );
          expect(triggered).toHaveBeenCalled();
          expect(successful).not.toHaveBeenCalled();
          resolve();
        },
        createExpiredJwtToken
      );
    });
  });
});
