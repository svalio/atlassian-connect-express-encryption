const { isAuthorizedJira } = require("../lib/internal/authorization");

describe("isAuthorizedJira", () => {
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
  const testUserId = "1ba2ee6a-test-account";

  it("throws on client error", () => {
    const thrownError = new Error("failed");
    const mock = mockPermissionClient(thrownError, [], []);
    expect.assertions(1);
    return isAuthorizedJira(mock, testUserId, ["ADMINISTER"], []).catch(err => {
      // eslint-disable-next-line jest/no-conditional-expect
      expect(err).toBe(thrownError);
    });
  });

  it("throws on API response errors", () => {
    const apiError = "Unrecognized permission";
    const mock = mockPermissionClient(undefined, ["MADE_UP"], [], [apiError]);
    expect.assertions(1);
    return isAuthorizedJira(
      mock,
      testUserId,
      ["Unrecognized permission"],
      []
    ).catch(err => {
      //eslint-disable-next-line jest/no-conditional-expect
      expect(err).toEqual([apiError]);
    });
  });

  it("returns false if global permission missing", () => {
    const mock = mockPermissionClient(undefined, []);
    return isAuthorizedJira(mock, testUserId, ["ADMINISTER"], []).then(
      result => {
        expect(result).toBe(false);
      }
    );
  });

  it("returns true if global permission matched", () => {
    const mock = mockPermissionClient(undefined, ["ADMINISTER"]);
    return isAuthorizedJira(mock, testUserId, ["ADMINISTER"], []).then(
      result => {
        expect(result).toBe(true);
      }
    );
  });

  it("returns false if project permission missing", () => {
    const mock = mockPermissionClient(undefined, [], []);
    return isAuthorizedJira(mock, testUserId, [
      { permissions: ["ADMINISTER_PROJECTS"], projects: [10000] }
    ]).then(result => {
      expect(result).toBe(false);
    });
  });

  it("returns true if project permission matched", () => {
    const mock = mockPermissionClient(
      undefined,
      [],
      [{ permission: "ADMINISTER_PROJECTS", projects: [10000] }]
    );
    return isAuthorizedJira(
      mock,
      testUserId,
      [],
      [{ permissions: ["ADMINISTER_PROJECTS"], projects: [10000] }]
    ).then(result => {
      expect(result).toBe(true);
    });
  });

  it("returns true if multiple project permission matched", () => {
    const mock = mockPermissionClient(
      undefined,
      [],
      [
        { permission: "ADMINISTER_PROJECTS", projects: [10000] },
        { permission: "CREATE_ISSUES", projects: [10000] }
      ]
    );
    return isAuthorizedJira(
      mock,
      testUserId,
      [],
      [
        {
          permissions: ["ADMINISTER_PROJECTS", "CREATE_ISSUES"],
          projects: [10000]
        }
      ]
    ).then(result => {
      expect(result).toBe(true);
    });
  });

  it("returns true if project permission matched as strings", () => {
    // Connect context are passed as strings, but the API represents them as numbers
    // They should still match regardless
    const mock = mockPermissionClient(
      undefined,
      [],
      [{ permission: "ADMINISTER_PROJECTS", projects: [10000] }]
    );
    return isAuthorizedJira(
      mock,
      testUserId,
      [],
      [{ permissions: ["ADMINISTER_PROJECTS"], projects: ["10000"] }]
    ).then(result => {
      expect(result).toBe(true);
    });
  });

  it("returns false if project permission matched and global permission fails", () => {
    const mock = mockPermissionClient(
      undefined,
      [],
      [{ permission: "ADMINISTER_PROJECTS", projects: [10000] }]
    );
    return isAuthorizedJira(
      mock,
      testUserId,
      ["ADMINISTER"],
      [{ permissions: ["ADMINISTER_PROJECTS"], projects: [10000] }]
    ).then(result => {
      expect(result).toBe(false);
    });
  });

  it("returns false if single project permission fails", () => {
    const mock = mockPermissionClient(
      undefined,
      [],
      [{ permission: "ADMINISTER_PROJECTS", projects: [10000] }]
    );
    return isAuthorizedJira(
      mock,
      testUserId,
      ["ADMINISTER"],
      [
        { permissions: ["ADMINISTER_PROJECTS"], projects: [10000] },
        { permissions: ["UPDATE_PROJECT"], projects: [10000] }
      ]
    ).then(result => {
      expect(result).toBe(false);
    });
  });

  it("returns false if project permission fails for given project", () => {
    const mock = mockPermissionClient(
      undefined,
      [],
      [{ permission: "ADMINISTER_PROJECTS", projects: [10000] }]
    );
    return isAuthorizedJira(
      mock,
      testUserId,
      ["ADMINISTER"],
      [{ permissions: ["ADMINISTER_PROJECTS"], projects: [10000, 10001] }]
    ).then(result => {
      expect(result).toBe(false);
    });
  });

  it("returns false if project permission fails for given issue", () => {
    const mock = mockPermissionClient(
      undefined,
      [],
      [{ permission: "TRANSITION_ISSUES", issues: [10000] }]
    );
    return isAuthorizedJira(
      mock,
      testUserId,
      ["ADMINISTER"],
      [{ permissions: ["TRANSITION_ISSUES"], issues: [10000, 10001] }]
    ).then(result => {
      expect(result).toBe(false);
    });
  });

  it("returns false if any project permission fail", () => {
    const mock = mockPermissionClient(
      undefined,
      [],
      [{ permission: "TRANSITION_ISSUES", issues: [10000] }]
    );
    return isAuthorizedJira(
      mock,
      testUserId,
      [],
      [
        {
          permissions: ["TRANSITION_ISSUES", "ADMINISTER_PROJECTS"],
          issues: [10000, 10001]
        }
      ]
    ).then(result => {
      expect(result).toBe(false);
    });
  });
});
