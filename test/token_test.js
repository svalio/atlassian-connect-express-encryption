const helper = require("./test_helper");
const assert = require("assert");
const http = require("http");
const express = require("express");
const bodyParser = require("body-parser");
const app = express();
const ac = require("../index");
const request = require("request");
const moment = require("moment");
const jwt = require("atlassian-jwt");
const logger = require("./logger");
const _ = require("lodash");

let addon = {};

const USER_ID = "admin";
const USER_ACCOUNT_ID = "048abaf9-04ea-44d1-acb9-b37de6cc5d2f";
const JWT_AUTH_RESPONDER_PATH = "/jwt_auth_responder";
const CHECK_TOKEN_RESPONDER_PATH = "/check_token_responder";
const JIRACONF_ALL_CDN = "https://connect-cdn.atl-paas.net/all.js";

describe("Token verification", function() {
  let server;
  let useBodyParser = true;

  function conditionalUseBodyParser(fn) {
    return function(req, res, next) {
      if (useBodyParser) {
        fn(req, res, next);
      } else {
        next();
      }
    };
  }

  before(function(done) {
    app.set("env", "development");
    app.use(
      conditionalUseBodyParser(bodyParser.urlencoded({ extended: false }))
    );
    app.use(conditionalUseBodyParser(bodyParser.json()));

    // configure test store
    ac.store.register("teststore", function(logger, opts) {
      return require("../lib/store/sequelize")(logger, opts);
    });

    // configure add-on
    addon = ac(
      app,
      {
        config: {
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
      function() {
        request(
          {
            url: helper.addonBaseUrl + "/installed",
            method: "POST",
            json: helper.installedPayload
          },
          function(err, res) {
            assert.equal(res.statusCode, 204, "Install hook failed");
            done();
          }
        );
      }
    );

    // Include the goodies
    app.use(addon.middleware());

    // default test routes
    const routeArgs = [
      JWT_AUTH_RESPONDER_PATH,
      addon.authenticate(),
      function(req, res) {
        const token = res.locals.token;
        res.send(token);
      }
    ];
    app.get.apply(app, routeArgs);
    app.post.apply(app, routeArgs);

    app.get(CHECK_TOKEN_RESPONDER_PATH, addon.checkValidToken(), function(
      req,
      res
    ) {
      const token = res.locals.token;
      res.send(token);
    });

    // start server
    server = http.createServer(app).listen(helper.addonPort);
  });

  after(function(done) {
    server.close();
    done();
  });

  afterEach(function() {
    useBodyParser = true;
  });

  function createJwtToken(req, secret, iss, context) {
    const jwtPayload = {
      sub: USER_ACCOUNT_ID,
      iss: iss || helper.installedPayload.clientKey,
      iat: moment()
        .utc()
        .unix(),
      exp: moment()
        .utc()
        .add(10, "minutes")
        .unix()
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
          method: method,
          path: path,
          query: {
            xdm_e: helper.productBaseUrl
          }
        })
    };

    const option = {
      method: method,
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
    return value && value.indexOf("ey") == 0;
  }

  it("should generate a token for authenticated GET requests", function(done) {
    const requestUrl = helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH;
    const requestOpts = createRequestOptions(JWT_AUTH_RESPONDER_PATH);

    request(requestUrl, requestOpts, function(err, res, body) {
      assert.equal(err, null);
      assert.equal(res.statusCode, 200);
      assert.ok(isBase64EncodedJson(body));
      assert.ok(isBase64EncodedJson(res.headers["x-acpt"]));
      done();
    });
  });

  it("should generate a token for authenticated POST requests", function(done) {
    const requestUrl = helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH;
    const requestOpts = createRequestOptions(
      JWT_AUTH_RESPONDER_PATH,
      undefined,
      "POST"
    );

    request(requestUrl, requestOpts, function(err, res, body) {
      assert.equal(err, null);
      assert.equal(res.statusCode, 200);
      assert.ok(isBase64EncodedJson(body));
      assert.ok(isBase64EncodedJson(res.headers["x-acpt"]));
      done();
    });
  });

  it("should not create tokens for unauthenticated GET requests", function(done) {
    app.get("/unprotected", function(req, res) {
      res.send(!res.locals.token ? "no token" : res.locals.token);
    });

    const requestUrl = helper.addonBaseUrl + "/unprotected";
    const requestOpts = {
      qs: {
        xdm_e: helper.productBaseUrl,
        user_id: USER_ID
      },
      jar: false
    };
    request(requestUrl, requestOpts, function(err, res, body) {
      assert.equal(err, null);
      assert.equal(res.statusCode, 200);
      assert.equal(body, "no token");
      done();
    });
  });

  it("should not create tokens for unauthenticated POST requests", function(done) {
    app.post("/unprotected", function(req, res) {
      res.send(!res.locals.token ? "no token" : res.locals.token);
    });

    const requestUrl = helper.addonBaseUrl + "/unprotected";
    const requestOpts = {
      method: "POST",
      form: {
        xdm_e: helper.productBaseUrl,
        user_id: USER_ID
      },
      jar: false
    };
    request(requestUrl, requestOpts, function(err, res, body) {
      assert.equal(err, null);
      assert.equal(res.statusCode, 200);
      assert.equal(body, "no token");
      done();
    });
  });

  it("should preserve the clientKey and user from the original signed request", function(done) {
    const requestUrl = helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH;
    const requestOpts = createRequestOptions(JWT_AUTH_RESPONDER_PATH);

    request(requestUrl, requestOpts, function(err, res, theToken) {
      assert.equal(err, null);
      assert.equal(res.statusCode, 200);

      const verifiedToken = jwt.decode(
        theToken,
        helper.installedPayload.sharedSecret
      );
      assert.equal(verifiedToken.aud[0], helper.installedPayload.clientKey);
      assert.equal(verifiedToken.sub, USER_ACCOUNT_ID);
      done();
    });
  });

  it("should allow requests with valid tokens using the checkValidToken middleware", function(done) {
    const requestUrl = helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH;
    const requestOpts = createRequestOptions(JWT_AUTH_RESPONDER_PATH);

    request(requestUrl, requestOpts, function(err, res, theToken) {
      assert.equal(err, null);
      assert.equal(res.statusCode, 200);

      const tokenUrl = helper.addonBaseUrl + CHECK_TOKEN_RESPONDER_PATH;
      const tokenRequestOpts = createTokenRequestOptions(theToken);

      request(tokenUrl, tokenRequestOpts, function(err, res) {
        assert.equal(err, null);
        assert.equal(res.statusCode, 200);
        done();
      });
    });
  });

  it("should allow requests with valid tokens using the authenticate middleware", function(done) {
    const requestUrl = helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH;
    const requestOpts = createRequestOptions(JWT_AUTH_RESPONDER_PATH);

    request(requestUrl, requestOpts, function(err, res, theToken) {
      assert.equal(err, null);
      assert.equal(res.statusCode, 200);

      const tokenUrl = helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH;
      const tokenRequestOpts = createRequestOptions(
        JWT_AUTH_RESPONDER_PATH,
        theToken
      );

      request(tokenUrl, tokenRequestOpts, function(err, res) {
        assert.equal(err, null);
        assert.equal(res.statusCode, 200);
        done();
      });
    });
  });

  it("should reject requests with no token", function(done) {
    const requestUrl = helper.addonBaseUrl + CHECK_TOKEN_RESPONDER_PATH;
    request(requestUrl, { jar: false }, function(err, res) {
      assert.equal(err, null);
      assert.equal(res.statusCode, 401);
      done();
    });
  });

  it("should reject requests with no token in query and no request body", function(done) {
    useBodyParser = false;
    const requestUrl = helper.addonBaseUrl + CHECK_TOKEN_RESPONDER_PATH;
    request(requestUrl, { jar: false }, function(err, res) {
      assert.equal(err, null);
      assert.equal(res.statusCode, 401);
      done();
    });
  });

  it("should not throw exception if request body is undefined", function(done) {
    useBodyParser = false;
    app.post("/return-host", function(req, res) {
      res.send(res.locals.hostBaseUrl);
    });

    const requestUrl = helper.addonBaseUrl + "/return-host";
    const requestOpts = {
      method: "POST",
      form: {
        xdm_e: "xdm_e_value"
      },
      jar: false
    };
    request(requestUrl, requestOpts, function(err, res) {
      assert.equal(err, null);
      assert.equal(res.body, "");
      done();
    });
  });

  it("should reject requests with token appeared in both query and body", function(done) {
    const requestUrl =
      helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH + "?jwt=token_in_query";
    const requestOpts = {
      method: "POST",
      form: {
        jwt: "token_in_body"
      },
      jar: false
    };
    request(requestUrl, requestOpts, function(err, res) {
      assert.equal(err, null);
      assert.equal(res.statusCode, 401);
      done();
    });
  });

  it("should use token from query parameter if appears both in body and header", function(done) {
    const requestUrl =
      helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH + "?jwt=token_in_query";
    const requestOpts = {
      headers: {
        Authorization: "JWT token_in_header"
      },
      jar: false
    };
    request(requestUrl, requestOpts, function(err, res) {
      assert.equal(err, null);
      assert.equal(res.statusCode, 401);
      done();
    });
  });

  it("should use token from request body if appears both in body and header", function(done) {
    const requestUrl = helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH;
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
    request(requestUrl, requestOpts, function(err, res) {
      assert.equal(err, null);
      assert.equal(res.statusCode, 401);
      done();
    });
  });

  it("should reject requests with invalid tokens", function(done) {
    const requestUrl = helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH;
    const requestOpts = createTokenRequestOptions("invalid");
    request(requestUrl, requestOpts, function(err, res) {
      assert.equal(err, null);
      assert.equal(res.statusCode, 401);
      done();
    });
  });

  it("should rehydrate response local variables from the token", function(done) {
    app.get("/protected_resource", addon.checkValidToken(), function(req, res) {
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

    const requestUrl = helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH;
    const requestOpts = createRequestOptions(JWT_AUTH_RESPONDER_PATH);

    request(requestUrl, requestOpts, function(err, res, theToken) {
      assert.equal(err, null);
      assert.equal(res.statusCode, 200);

      const tokenUrl = helper.addonBaseUrl + "/protected_resource";
      const tokenRequestOpts = createTokenRequestOptions(theToken);

      request(tokenUrl, tokenRequestOpts, function(err, res, body) {
        const payload = JSON.parse(body);
        assert.equal(null, err);
        assert.equal(200, res.statusCode);
        assert.equal(payload.clientKey, helper.installedPayload.clientKey);
        assert.equal(payload.hostBaseUrl, helper.productBaseUrl);
        assert.equal(
          payload.hostStylesheetUrl,
          hostResourceUrl(app, helper.productBaseUrl, "css")
        );
        assert.equal(payload.hostScriptUrl, JIRACONF_ALL_CDN);
        assert.equal(payload.userAccountId, USER_ACCOUNT_ID);
        assert.equal(payload.userId, USER_ID);
        jwt.decode(payload.token, helper.installedPayload.sharedSecret);
        done();
      });
    });
  });

  it("should rehydrate response local variables from context JWT", function(done) {
    app.get("/protected_context_resource", addon.checkValidToken(), function(
      req,
      res
    ) {
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
    });

    const requestUrl = helper.addonBaseUrl + JWT_AUTH_RESPONDER_PATH;
    const context = { issue: { key: "ABC-123" } };
    const token = createJwtToken(null, null, null, context);
    const requestOpts = createRequestOptions(JWT_AUTH_RESPONDER_PATH, token);

    request(requestUrl, requestOpts, function(err, res, theToken) {
      assert.equal(err, null);
      assert.equal(res.statusCode, 200);

      const tokenUrl = helper.addonBaseUrl + "/protected_context_resource";
      const tokenRequestOpts = createTokenRequestOptions(theToken);

      request(tokenUrl, tokenRequestOpts, function(err, res, body) {
        const payload = JSON.parse(body);
        assert.strictEqual(null, err);
        assert.strictEqual(200, res.statusCode);
        assert.strictEqual(
          payload.clientKey,
          helper.installedPayload.clientKey
        );
        assert.strictEqual(payload.hostBaseUrl, helper.productBaseUrl);
        assert.strictEqual(
          payload.hostStylesheetUrl,
          hostResourceUrl(app, helper.productBaseUrl, "css")
        );
        assert.strictEqual(payload.hostScriptUrl, JIRACONF_ALL_CDN);
        assert.strictEqual(payload.userAccountId, USER_ACCOUNT_ID);
        assert.deepStrictEqual(payload.context, context);
        jwt.decode(payload.token, helper.installedPayload.sharedSecret);
        done();
      });
    });
  });

  it("should check for a token on reinstall", function(done) {
    request(
      {
        url: helper.addonBaseUrl + "/installed",
        method: "POST",
        json: helper.installedPayload
      },
      function(err, res) {
        assert.equal(res.statusCode, 401, "re-installation not verified");
        done();
      }
    );
  });

  it("should validate token using old secret on reinstall", function(done) {
    request(
      {
        url: helper.addonBaseUrl + "/installed",
        method: "POST",
        json: _.extend({}, helper.installedPayload),
        headers: {
          Authorization:
            "JWT " +
            createJwtToken({
              method: "POST",
              path: "/installed"
            })
        }
      },
      function(err, res) {
        assert.equal(err, null);
        assert.equal(
          res.statusCode,
          204,
          "signed reinstall request should have been accepted"
        );
        done();
      }
    );
  });

  it("should not accept reinstall request signed with new secret", function(done) {
    const newSecret = "newSharedSecret";
    request(
      {
        url: helper.addonBaseUrl + "/installed",
        method: "POST",
        json: _.extend({}, helper.installedPayload, {
          sharedSecret: newSecret
        }),
        headers: {
          Authorization:
            "JWT " +
            createJwtToken(
              {
                method: "POST",
                path: "/installed"
              },
              newSecret
            )
        }
      },
      function(err, res) {
        assert.equal(err, null);
        assert.equal(
          res.statusCode,
          400,
          "reinstall request signed with old secret should not have been accepted"
        );
        done();
      }
    );
  });

  it("should only accept install requests for the authenticated client", function(done) {
    const maliciousSecret = "mwahaha";
    const maliciousClient = _.extend({}, helper.installedPayload, {
      sharedSecret: maliciousSecret,
      clientKey: "crafty-client"
    });
    request({
      url: helper.addonBaseUrl + "/installed",
      method: "POST",
      json: maliciousClient
    });
    request(
      {
        url: helper.addonBaseUrl + "/installed",
        method: "POST",
        json: _.extend({}, helper.installedPayload, {
          sharedSecret: "newSharedSecret"
        }),
        headers: {
          Authorization:
            "JWT " +
            createJwtToken(
              {
                method: "POST",
                path: "/installed"
              },
              maliciousSecret,
              maliciousClient.clientKey
            )
        }
      },
      function(err, res) {
        assert.equal(err, null);
        assert.equal(
          res.statusCode,
          401,
          "reinstall request authenticated as the wrong client should not have been accepted"
        );
        done();
      }
    );
  });

  function hostResourceUrl(app, baseUrl, type) {
    const suffix = app.get("env") === "development" ? "-debug" : "";
    return baseUrl + "/atlassian-connect/all" + suffix + "." + type;
  }
});
