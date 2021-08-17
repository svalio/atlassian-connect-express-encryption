const {
  authorizeJira,
  authorizeConfluence
} = require("../lib/middleware/authorization");

describe("authorizeJira", () => {
  const testUserId = "1ba2ee6a-test-account";
  function mockPermissionClient(err, globalGrants, projectGrants, errors) {
    return {
      post: (_, cb) => {
        if (err) {
          cb(err);
          return;
        }
        cb(
          undefined,
          {},
          {
            errors,
            projectPermissions: projectGrants,
            globalPermissions: globalGrants
          }
        );
      }
    };
  }

  function mockJiraRequest(userAccountId, jiraContext) {
    return {
      context: {
        userAccountId,
        // e.g. from a context JWT
        context: {
          jira: jiraContext
        }
      }
    };
  }

  it("returns 401 on permission lookup error", () => {
    return new Promise(done => {
      const addon = {
        httpClient: () => mockPermissionClient(new Error("Boom")),
        logger: {
          warn: () => {}
        }
      };
      const req = mockJiraRequest(testUserId, {});
      const res = {
        status: code => {
          expect(code).toBe(401);
          done();
          return {
            send: () => {}
          };
        }
      };
      authorizeJira(addon, {})(req, res);
    });
  });

  it("returns 401 on project permission without context set", () => {
    return new Promise(done => {
      const addon = {
        httpClient: () => mockPermissionClient(undefined),
        logger: {
          warn: () => {}
        }
      };
      const req = mockJiraRequest(testUserId, {});
      const res = {
        status: code => {
          expect(code).toBe(401);
          done();
          return {
            send: () => {}
          };
        }
      };

      authorizeJira(addon, { project: ["ADMINISTER_PROJECTS"] })(req, res);
    });
  });

  // eslint-disable-next-line jest/expect-expect
  it("calls next on authZ pass", () => {
    return new Promise(done => {
      const projectId = 10000;
      const addon = {
        httpClient: () =>
          mockPermissionClient(
            undefined,
            ["ADMINISTER"],
            [{ permission: "ADMINISTER_PROJECTS", projects: [projectId] }]
          ),
        logger: {
          warn: () => {}
        }
      };
      const req = mockJiraRequest(testUserId, {
        project: {
          id: projectId
        }
      });
      const res = {};
      authorizeJira(addon, {
        global: ["ADMINISTER"],
        project: ["ADMINISTER_PROJECTS"]
      })(req, res, done);
    });
  });

  it("returns 401 on authZ check unauthorized", () => {
    return new Promise(done => {
      const addon = {
        httpClient: () => mockPermissionClient(undefined, []),
        logger: {
          warn: () => {}
        }
      };
      const req = mockJiraRequest(testUserId, {});
      const res = {
        status: code => {
          expect(code).toBe(401);
          done();
          return {
            send: () => {}
          };
        }
      };

      authorizeJira(addon, { global: ["ADMINISTER"] })(req, res);
    });
  });
});

describe("authorizeConfluence", () => {
  const testUserId = "1ba2ee6a-test-account";
  const testContentId = "1337";

  function mockHttpClient(userOps, contentOpCheck) {
    return {
      // operation lookup
      get: (_, cb) => {
        if (userOps.err) {
          cb(userOps.err);
          return;
        }
        cb(
          undefined,
          {},
          {
            operations: userOps.operations
          }
        );
      },
      // content permission check
      post: (_, cb) => {
        if (contentOpCheck.err) {
          cb(contentOpCheck.err);
          return;
        }
        cb(
          undefined,
          {},
          {
            errors: contentOpCheck.errors,
            hasPermission: contentOpCheck.hasPermission
          }
        );
      }
    };
  }

  function mockConfluenceRequest(userAccountId, confluenceContext) {
    return {
      context: {
        userAccountId,
        context: {
          confluence: confluenceContext
        }
      }
    };
  }

  it("returns 401 on user operation lookup error", () => {
    return new Promise(done => {
      const addon = {
        httpClient: () => mockHttpClient({ err: new Error("Boom") }),
        logger: {
          warn: () => {}
        }
      };
      const req = mockConfluenceRequest(testUserId, {});
      const res = {
        status: code => {
          expect(code).toBe(401);
          done();
          return {
            send: () => {}
          };
        }
      };
      authorizeConfluence(addon, { application: ["use"] })(req, res);
    });
  });

  it("returns 401 on content operation lookup error", () => {
    return new Promise(done => {
      const addon = {
        httpClient: () => mockHttpClient({}, { err: new Error("Boom") }),
        logger: {
          warn: () => {}
        }
      };
      const req = mockConfluenceRequest(testUserId, {});
      const res = {
        status: code => {
          expect(code).toBe(401);
          done();
          return {
            send: () => {}
          };
        }
      };
      authorizeConfluence(addon, { content: "read" })(req, res);
    });
  });

  it("returns 401 on content operation without context set", () => {
    return new Promise(done => {
      const addon = {
        httpClient: () => mockHttpClient({}, {}),
        logger: {
          warn: () => {}
        }
      };
      const req = mockConfluenceRequest(testUserId, {});
      const res = {
        status: code => {
          expect(code).toBe(401);
          done();
          return {
            send: () => {}
          };
        }
      };

      authorizeConfluence(addon, { content: "read" })(req, res);
    });
  });

  // eslint-disable-next-line jest/expect-expect
  it("calls next on authZ pass", () => {
    return new Promise(done => {
      const addon = {
        httpClient: () =>
          mockHttpClient(
            {
              operations: [
                {
                  operation: "administer",
                  targetType: "application"
                }
              ]
            },
            {
              hasPermission: true
            }
          ),
        logger: {
          warn: () => {}
        }
      };
      const req = mockConfluenceRequest(testUserId, {
        content: {
          id: testContentId
        }
      });
      const res = {};
      authorizeConfluence(addon, {
        application: ["administer"],
        content: "read"
      })(req, res, done);
    });
  });

  it("returns 401 on authZ check unauthorized", () => {
    return new Promise(done => {
      const addon = {
        httpClient: () => mockHttpClient({}, {}),
        logger: {
          warn: () => {}
        }
      };
      const req = mockConfluenceRequest(testUserId, {});
      const res = {
        status: code => {
          expect(code).toBe(401);
          done();
          return {
            send: () => {}
          };
        }
      };

      authorizeConfluence(addon, { application: ["administer"] })(req, res);
    });
  });

  it("returns 401 on content operation pass but user operation fail", () => {
    return new Promise(done => {
      const addon = {
        httpClient: () => mockHttpClient({}, { hasPermission: false }),
        logger: {
          warn: () => {}
        }
      };
      const req = mockConfluenceRequest(testUserId, {
        content: {
          id: testContentId
        }
      });
      const res = {
        status: code => {
          expect(code).toBe(401);
          done();
          return {
            send: () => {}
          };
        }
      };

      authorizeConfluence(addon, { content: "read" })(req, res);
    });
  });
});
