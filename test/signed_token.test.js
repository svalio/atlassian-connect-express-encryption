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
const nock = require("nock");

const app = express();
let addon = {};

const USER_ID = "admin";
const USER_ACCOUNT_ID = "048abaf9-04ea-44d1-acb9-b37de6cc5d2f";
const JWS_AUTH_RESPONDER_PATH = "/jws_auth_responder";
const CHECK_TOKEN_RESPONDER_PATH = "/check_token_responder";

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
    nock("https://connect-install-keys.atlassian.com")
      .persist()
      .get(`/${helper.keyId}`)
      .reply(200, helper.publicKey);

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
              json: _.extend({}, helper.installedPayload),
              headers: {
                Authorization: `JWT ${createJwtToken({
                  method: "POST",
                  path: "/installed"
                })}`
              }
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

  function createJwtToken(req, iss, context, header, privateKey) {
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

    return jwt.encodeAsymmetric(
      jwtPayload,
      privateKey || helper.privateKey,
      jwt.AsymmetricAlgorithm.RS256,
      header || { kid: helper.keyId }
    );
  }

  function createTokenRequestOptions(token) {
    return {
      qs: {
        acpt: token
      },
      jar: false
    };
  }

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

  it("should validate token using public key on install", () => {
    return new Promise(resolve => {
      request(
        {
          url: `${helper.addonBaseUrl}/installed`,
          method: "POST",
          json: _.extend({}, helper.installedPayload),
          headers: {
            Authorization: `JWT ${createJwtToken({
              method: "POST",
              path: "/installed"
            })}`
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

  it("should accept reinstall request with new secret in body", () => {
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
            Authorization: `JWT ${createJwtToken({
              method: "POST",
              path: "/installed"
            })}`
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

  it("should not accept reinstall request with wrong private key", () => {
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
              null,
              null,
              null,
              helper.otherPrivateKey
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

  it("should only accept install requests if client key from the token matches the body", () => {
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
              "crafty-client"
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

  it("should accept signed initial install request if client key from the token matches the body", () => {
    return new Promise(resolve => {
      request(
        {
          url: `${helper.addonBaseUrl}/installed`,
          method: "POST",
          json: _.extend({}, helper.installedPayload, {
            sharedSecret: "newSharedSecret",
            clientKey: "client-key"
          }),
          headers: {
            Authorization: `JWT ${createJwtToken(
              {
                method: "POST",
                path: "/installed"
              },
              "client-key"
            )}`
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

  it("should reject unsigned initial install request", () => {
    return new Promise(resolve => {
      request(
        {
          url: `${helper.addonBaseUrl}/installed`,
          method: "POST",
          json: _.extend({}, helper.installedPayload, {
            sharedSecret: "newSharedSecret",
            clientKey: "client-key"
          }),
          headers: {}
        },
        (err, res) => {
          expect(err).toBeNull();
          expect(res.statusCode).toEqual(401);
          resolve();
        }
      );
    });
  });
});
