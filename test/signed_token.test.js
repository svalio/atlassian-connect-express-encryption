const jwt = require("atlassian-jwt");
const bodyParser = require("body-parser");
const express = require("express");
const http = require("http");
const _ = require("lodash");
const moment = require("moment");
const request = require("request");
const helper = require("./test_helper");
const ac = require("../index");
const logger = require("./logger");

const app = express();
let addon = {};

const USER_ID = "admin";
const USER_ACCOUNT_ID = "048abaf9-04ea-44d1-acb9-b37de6cc5d2f";
const JWS_AUTH_RESPONDER_PATH = "/jws_auth_responder";
const CHECK_TOKEN_RESPONDER_PATH = "/check_token_responder";
const JIRACONF_ALL_CDN = "https://connect-cdn.atl-paas.net/all.js";

describe("Token verification", () => {
  let server;
  let useBodyParser = true;

  function conditionalUseBodyParser(fn) {
    return function (req, res, next) {
      if (useBodyParser) {
        fn(req, res, next);
      } else {
        next();
      }
    };
  }

  beforeAll(() => {
    app.set("env", "development");
    app.use(
      conditionalUseBodyParser(bodyParser.urlencoded({ extended: false }))
    );
    app.use(conditionalUseBodyParser(bodyParser.json()));

    // configure test store
    ac.store.register("teststore", (logger, opts) => {
      return require("../lib/store/sequelize")(logger, opts);
    });

    return new Promise(resolve => {
      // configure add-on
      addon = ac(
        app,
        {
          config: {
            signedInstall: true,
            development: {
              store: {
                adapter: "teststore",
                type: "memory"
              },
              hosts: [helper.productBaseUrl]
            }
          }
        },
        logger,
        () => {
          request(
            {
              url: `${helper.addonBaseUrl}/installed`,
              method: "POST",
              json: helper.installedPayload
            },
            (err, res) => {
              if (res.statusCode !== 204) {
                throw new Error("Install hook failed");
              }
              resolve();
            }
          );
        }
      );

      // Include the goodies
      app.use(addon.middleware());

      // default test routes
      const jwsRouteArgs = [
        JWS_AUTH_RESPONDER_PATH,
        addon.verifyInstallHook(),
        function (req, res) {
          const token = res.locals.token;
          res.send(token);
        }
      ];
      app.get.apply(app, jwsRouteArgs);
      app.post.apply(app, jwsRouteArgs);

      app.get(
        CHECK_TOKEN_RESPONDER_PATH,
        addon.checkValidToken(),
        (req, res) => {
          const token = res.locals.token;
          res.send(token);
        }
      );

      // start server
      server = http.createServer(app).listen(helper.addonPort);
    });
  });

  afterAll(() => {
    return server.close();
  });

  afterEach(() => {
    useBodyParser = true;
  });

  function createJwtToken(req, secret, iss, context) {
    const jwtPayload = {
      sub: USER_ACCOUNT_ID,
      iss: iss || helper.installedPayload.clientKey,
      iat: moment().utc().unix(),
      exp: moment().utc().add(10, "minutes").unix()
    };

    jwtPayload.context = context
      ? context
      : {
          user: {
            accountId: USER_ACCOUNT_ID,
            userKey: USER_ID,
            userId: USER_ID
          }
        };

    if (req) {
      jwtPayload.qsh = jwt.createQueryStringHash(jwt.fromExpressRequest(req));
    }

    return jwt.encode(
      jwtPayload,
      secret || helper.installedPayload.sharedSecret
    );
  }

  function createRequestOptions(path, jwt, method) {
    method = (method || "GET").toUpperCase();

    const data = {
      xdm_e: helper.productBaseUrl,
      jwt:
        jwt ||
        createJwtToken({
          // mock the request
          method,
          path,
          query: {
            xdm_e: helper.productBaseUrl
          }
        })
    };

    const option = {
      method,
      jar: false
    };

    if (method === "GET") {
      option["qs"] = data;
    } else {
      option["form"] = data;
    }

    return option;
  }

  function createTokenRequestOptions(token) {
    return {
      qs: {
        acpt: token
      },
      jar: false
    };
  }

  function isBase64EncodedJson(value) {
    return value && value.indexOf("ey") === 0;
  }

  it("should verifay a JWS token for authenticated GET requests", async () => {
    const requestUrl = helper.addonBaseUrl + JWS_AUTH_RESPONDER_PATH;
    const requestOpts = createRequestOptions(JWS_AUTH_RESPONDER_PATH);

    return new Promise(resolve => {
      request(requestUrl, requestOpts, (err, res, body) => {
        expect(err).toBeNull();
        expect(res.statusCode).toEqual(200);
        expect(isBase64EncodedJson(body)).toEqual(true);
        expect(isBase64EncodedJson(res.headers["x-acpt"])).toEqual(true);
        resolve();
      });
    });
  });

  it("should verifay a JWS token for authenticated POST requests", () => {
    const requestUrl = helper.addonBaseUrl + JWS_AUTH_RESPONDER_PATH;
    const requestOpts = createRequestOptions(
      JWS_AUTH_RESPONDER_PATH,
      undefined,
      "POST"
    );

    return new Promise(resolve => {
      request(requestUrl, requestOpts, (err, res, body) => {
        expect(err).toBeNull();
        expect(res.statusCode).toEqual(200);
        expect(isBase64EncodedJson(body)).toEqual(true);
        expect(isBase64EncodedJson(res.headers["x-acpt"])).toEqual(true);
        resolve();
      });
    });
  });

  it("should allow requests with valid tokens using the authenticate middleware", () => {
    const requestUrl = helper.addonBaseUrl + JWS_AUTH_RESPONDER_PATH;
    const requestOpts = createRequestOptions(JWS_AUTH_RESPONDER_PATH);

    return new Promise(resolve => {
      request(requestUrl, requestOpts, (err, res, theToken) => {
        expect(err).toBeNull();
        expect(res.statusCode).toEqual(200);

        const tokenUrl = helper.addonBaseUrl + JWS_AUTH_RESPONDER_PATH;
        const tokenRequestOpts = createRequestOptions(
          JWS_AUTH_RESPONDER_PATH,
          theToken
        );

        request(tokenUrl, tokenRequestOpts, (err, res) => {
          expect(err).toBeNull();
          expect(res.statusCode).toEqual(200);
          resolve();
        });
      });
    });
  });

  it("should reject requests with no token", () => {
    const requestUrl = helper.addonBaseUrl + CHECK_TOKEN_RESPONDER_PATH;
    return new Promise(resolve => {
      request(requestUrl, { jar: false }, (err, res) => {
        expect(err).toBeNull();
        expect(res.statusCode).toEqual(401);
        resolve();
      });
    });
  });

  it("should reject requests with no token in query and no request body", () => {
    useBodyParser = false;
    const requestUrl = helper.addonBaseUrl + CHECK_TOKEN_RESPONDER_PATH;
    return new Promise(resolve => {
      request(requestUrl, { jar: false }, (err, res) => {
        expect(err).toBeNull();
        expect(res.statusCode).toEqual(401);
        resolve();
      });
    });
  });

  it("should not throw exception if request body is undefined", () => {
    useBodyParser = false;
    app.post("/return-host", (req, res) => {
      res.send(res.locals.hostBaseUrl);
    });

    const requestUrl = `${helper.addonBaseUrl}/return-host`;
    const requestOpts = {
      method: "POST",
      form: {
        xdm_e: "xdm_e_value"
      },
      jar: false
    };

    return new Promise(resolve => {
      request(requestUrl, requestOpts, (err, res) => {
        expect(err).toBeNull();
        expect(res.body).toEqual("");
        resolve();
      });
    });
  });

  it("should reject requests with token appeared in both query and body", () => {
    const requestUrl = `${
      helper.addonBaseUrl + JWS_AUTH_RESPONDER_PATH
    }?jwt=token_in_query`;
    const requestOpts = {
      method: "POST",
      form: {
        jwt: "token_in_body"
      },
      jar: false
    };

    return new Promise(resolve => {
      request(requestUrl, requestOpts, (err, res) => {
        expect(err).toBeNull();
        expect(res.statusCode).toEqual(401);
        resolve();
      });
    });
  });

  it("should use token from query parameter if appears both in body and header", () => {
    const requestUrl = `${
      helper.addonBaseUrl + JWS_AUTH_RESPONDER_PATH
    }?jwt=token_in_query`;
    const requestOpts = {
      headers: {
        Authorization: "JWT token_in_header"
      },
      jar: false
    };

    return new Promise(resolve => {
      request(requestUrl, requestOpts, (err, res) => {
        expect(err).toBeNull();
        expect(res.statusCode).toEqual(401);
        resolve();
      });
    });
  });

  it("should use token from request body if appears both in body and header", () => {
    const requestUrl = helper.addonBaseUrl + JWS_AUTH_RESPONDER_PATH;
    const requestOpts = {
      method: "POST",
      headers: {
        Authorization: "JWT token_in_header"
      },
      form: {
        jwt: "token_in_body"
      },
      jar: false
    };

    return new Promise(resolve => {
      request(requestUrl, requestOpts, (err, res) => {
        expect(err).toBeNull();
        expect(res.statusCode).toEqual(401);
        resolve();
      });
    });
  });

  it("should reject requests with invalid tokens", () => {
    const requestUrl = helper.addonBaseUrl + JWS_AUTH_RESPONDER_PATH;
    const requestOpts = createTokenRequestOptions("invalid");
    return new Promise(resolve => {
      request(requestUrl, requestOpts, (err, res) => {
        expect(err).toBeNull();
        expect(res.statusCode).toEqual(401);
        resolve();
      });
    });
  });

  it("should rehydrate response local variables from the token", () => {
    app.get("/protected_resource", addon.checkValidToken(), (req, res) => {
      res.send({
        clientKey: res.locals.clientKey,
        token: res.locals.token,
        userId: res.locals.userId,
        userAccountId: res.locals.userAccountId,
        hostBaseUrl: res.locals.hostBaseUrl,
        hostStylesheetUrl: res.locals.hostStylesheetUrl,
        hostScriptUrl: res.locals.hostScriptUrl
      });
    });

    const requestUrl = helper.addonBaseUrl + JWS_AUTH_RESPONDER_PATH;
    const requestOpts = createRequestOptions(JWS_AUTH_RESPONDER_PATH);

    return new Promise(resolve => {
      request(requestUrl, requestOpts, (err, res, theToken) => {
        expect(err).toBeNull();
        expect(res.statusCode).toEqual(200);

        const tokenUrl = `${helper.addonBaseUrl}/protected_resource`;
        const tokenRequestOpts = createTokenRequestOptions(theToken);

        request(tokenUrl, tokenRequestOpts, (err, res, body) => {
          const payload = JSON.parse(body);
          expect(err).toBeNull();
          expect(res.statusCode).toEqual(200);
          expect(payload.clientKey).toEqual(helper.installedPayload.clientKey);
          expect(payload.hostBaseUrl).toEqual(helper.productBaseUrl);
          expect(payload.hostStylesheetUrl).toEqual(
            hostResourceUrl(app, helper.productBaseUrl, "css")
          );
          expect(payload.hostScriptUrl).toEqual(JIRACONF_ALL_CDN);
          expect(payload.userAccountId).toEqual(USER_ACCOUNT_ID);
          expect(payload.userId).toEqual(USER_ID);
          jwt.decode(payload.token, helper.installedPayload.sharedSecret);
          resolve();
        });
      });
    });
  });

  it("should rehydrate response local variables from context JWT", () => {
    app.get(
      "/protected_context_resource",
      addon.checkValidToken(),
      (req, res) => {
        res.send({
          clientKey: res.locals.clientKey,
          token: res.locals.token,
          userId: res.locals.userId,
          userAccountId: res.locals.userAccountId,
          hostBaseUrl: res.locals.hostBaseUrl,
          hostStylesheetUrl: res.locals.hostStylesheetUrl,
          hostScriptUrl: res.locals.hostScriptUrl,
          context: res.locals.context
        });
      }
    );

    const requestUrl = helper.addonBaseUrl + JWS_AUTH_RESPONDER_PATH;
    const context = { issue: { key: "ABC-123" } };
    const token = createJwtToken(null, null, null, context);
    const requestOpts = createRequestOptions(JWS_AUTH_RESPONDER_PATH, token);

    return new Promise(resolve => {
      request(requestUrl, requestOpts, (err, res, theToken) => {
        expect(err).toBeNull();
        expect(res.statusCode).toEqual(200);

        const tokenUrl = `${helper.addonBaseUrl}/protected_context_resource`;
        const tokenRequestOpts = createTokenRequestOptions(theToken);

        request(tokenUrl, tokenRequestOpts, (err, res, body) => {
          const payload = JSON.parse(body);
          expect(err).toBeNull();
          expect(res.statusCode).toEqual(200);
          expect(payload.clientKey).toEqual(helper.installedPayload.clientKey);
          expect(payload.hostBaseUrl).toEqual(helper.productBaseUrl);
          expect(payload.hostStylesheetUrl).toEqual(
            hostResourceUrl(app, helper.productBaseUrl, "css")
          );
          expect(payload.hostScriptUrl).toEqual(JIRACONF_ALL_CDN);
          expect(payload.userAccountId).toEqual(USER_ACCOUNT_ID);
          expect(payload.context).toEqual(context);
          jwt.decode(payload.token, helper.installedPayload.sharedSecret);
          resolve();
        });
      });
    });
  });

  it("should check for a token on reinstall", () => {
    return new Promise(resolve => {
      request(
        {
          url: `${helper.addonBaseUrl}/installed`,
          method: "POST",
          json: helper.installedPayload
        },
        (err, res) => {
          expect(res.statusCode).toEqual(401);
          resolve();
        }
      );
    });
  });

  it.only("should validate token using publid key on install", () => {
    return new Promise(resolve => {
      request(
        {
          url: `${helper.addonBaseUrl}/installed`,
          method: "POST",
          json: _.extend({}, helper.installedPayload),
          headers: {
            Authorization: 'JWT eyJraWQiOiI3OTdlODQxNy05YTU4LTRhNmYtYjEwOS1lN2ZhNzAyMDY3Y2YiLCJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiI1ZTY4YWMzYmUzYzNlNzBkMDIzYTVmNDYiLCJxc2giOiI0YTJlMWRlOGNhNzRlNmNhZmU4ODYyZDMzMmZhM2FjN2E4ZTUxZTY5MmJjNmQ3OThlYTRkZmVkYzE0OTQ4YmY0IiwiaXNzIjoiYmMwODFiMjQtNWQwZS0zNzZjLTgzODItNTAxM2NhODhjNWIwIiwiY29udGV4dCI6e30sImV4cCI6MTYxODE4NjA3MCwiaWF0IjoxNjE4MTg1MTcwfQ.qfBdhGgFSr7JIXiyN4uXZkUXhRuQM6bQkd3RmvHQD2OGlrCtnnOOwSYVhTspbWg1M80bcfZJajhtJyK5LlqxsbDUomDIbx-yNc2FVW9aEcfoXPiGY1NCVxXRRI25HdVClu8gNKSS0PLXKxApNOyO809V9K9GplzzR_Vof9Z2rFvmg4gwxWddrNfxlTweGd5JNa3DvgXLAws9valM10E3EDWuyhj-mI-vZb6lbgAFXIm-wRQVmICKCMBEq4-IBWeo-MANGdY2MldYb52-N1_gMFpcxn8VQkCRX1HDxGkLeR9TznaUiAyaDSpBKnao2Pr2XqaWsZauhwx4woXh3XoUXg'
          }
        },
        (err, res) => {
          expect(err).toBeNull();
          expect(res.statusCode).toEqual(204);
          resolve();
        }
      );
    });
  });

  it("should not accept reinstall request signed with new secret", () => {
    const newSecret = "newSharedSecret";

    return new Promise(resolve => {
      request(
        {
          url: `${helper.addonBaseUrl}/installed`,
          method: "POST",
          json: _.extend({}, helper.installedPayload, {
            sharedSecret: newSecret
          }),
          headers: {
            Authorization: `JWT ${createJwtToken(
              {
                method: "POST",
                path: "/installed"
              },
              newSecret
            )}`
          }
        },
        (err, res) => {
          expect(err).toBeNull();
          expect(res.statusCode).toEqual(400);
          resolve();
        }
      );
    });
  });

  it("should only accept install requests for the authenticated client", () => {
    const maliciousSecret = "mwahaha";
    const maliciousClient = _.extend({}, helper.installedPayload, {
      sharedSecret: maliciousSecret,
      clientKey: "crafty-client"
    });
    request({
      url: `${helper.addonBaseUrl}/installed`,
      method: "POST",
      json: maliciousClient
    });

    return new Promise(resolve => {
      request(
        {
          url: `${helper.addonBaseUrl}/installed`,
          method: "POST",
          json: _.extend({}, helper.installedPayload, {
            sharedSecret: "newSharedSecret"
          }),
          headers: {
            Authorization: `JWT ${createJwtToken(
              {
                method: "POST",
                path: "/installed"
              },
              maliciousSecret,
              maliciousClient.clientKey
            )}`
          }
        },
        (err, res) => {
          expect(err).toBeNull();
          expect(res.statusCode).toEqual(401);
          resolve();
        }
      );
    });
  });

  function hostResourceUrl(app, baseUrl, type) {
    const suffix = app.get("env") === "development" ? "-debug" : "";
    return `${baseUrl}/atlassian-connect/all${suffix}.${type}`;
  }
});
