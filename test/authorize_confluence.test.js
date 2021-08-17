const {
  isContentOperationAuthorizedConfluence,
  isUserOperationAuthorizedConfluence
} = require("../lib/internal/authorization");

describe("isContentOperationAuthorized", () => {
  function mockContentOperationClient(err, hasPermission, errors) {
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
            hasPermission,
            errors
          }
        );
      }
    };
  }
  const testUserId = "1ba2ee6a-test-account";
  const testContentId = "1066";

  it("throws on client error", () => {
    const thrownError = new Error("failed");
    const mock = mockContentOperationClient(thrownError);
    expect.assertions(1);
    return isContentOperationAuthorizedConfluence(
      mock,
      testUserId,
      testContentId,
      "read"
    ).catch(err => {
      // eslint-disable-next-line jest/no-conditional-expect
      expect(err).toBe(thrownError);
    });
  });

  it("throws on invalid content ID", () => {
    const thrownError = new Error("Invalid content ID");
    const mock = mockContentOperationClient(thrownError);
    expect.assertions(1);
    return isContentOperationAuthorizedConfluence(
      mock,
      testUserId,
      "../uh oh",
      "read"
    ).catch(err => {
      // eslint-disable-next-line jest/no-conditional-expect
      expect(err).toEqual(thrownError);
    });
  });

  it("throws on API response errors", () => {
    const mock = mockContentOperationClient(undefined, false, ["boom"]);
    expect.assertions(1);
    return isContentOperationAuthorizedConfluence(
      mock,
      testUserId,
      testContentId,
      "read"
    ).catch(err => {
      // eslint-disable-next-line jest/no-conditional-expect
      expect(err).toEqual(["boom"]);
    });
  });

  it("returns false on missing permission", () => {
    const mock = mockContentOperationClient(undefined, false);
    return isContentOperationAuthorizedConfluence(
      mock,
      testUserId,
      testContentId,
      "read"
    ).then(result => {
      expect(result).toBe(false);
    });
  });

  it("returns true on matched permission", () => {
    const mock = mockContentOperationClient(undefined, true);
    return isContentOperationAuthorizedConfluence(
      mock,
      testUserId,
      testContentId,
      "read"
    ).then(result => {
      expect(result).toBe(true);
    });
  });
});

describe("isUserOperationAuthorized", () => {
  function mockUserOperationsClient(err, operations) {
    return {
      get: (_, cb) => {
        if (err) {
          cb(err);
          return;
        }
        cb(
          undefined,
          {},
          {
            operations
          }
        );
      }
    };
  }
  const testUserId = "1ba2ee6a-test-account";

  it("throws on client error", () => {
    const thrownError = new Error("failed");
    const mock = mockUserOperationsClient(thrownError);
    expect.assertions(1);
    return isUserOperationAuthorizedConfluence(mock, testUserId, ["use"]).catch(
      err => {
        // eslint-disable-next-line jest/no-conditional-expect
        expect(err).toBe(thrownError);
      }
    );
  });

  it("returns false if no match", () => {
    const mock = mockUserOperationsClient(undefined, [
      { operation: "use", targetType: "application" }
    ]);
    return isUserOperationAuthorizedConfluence(mock, testUserId, [
      "something"
    ]).then(result => {
      expect(result).toBe(false);
    });
  });

  it("returns false if targetType not application", () => {
    const mock = mockUserOperationsClient(undefined, [
      { operation: "use", targetType: "space" }
    ]);
    return isUserOperationAuthorizedConfluence(mock, testUserId, ["use"]).then(
      result => {
        expect(result).toBe(false);
      }
    );
  });

  it("returns true if operation matches", () => {
    const mock = mockUserOperationsClient(undefined, [
      { operation: "use", targetType: "application" }
    ]);
    return isUserOperationAuthorizedConfluence(mock, testUserId, ["use"]).then(
      result => {
        expect(result).toBe(true);
      }
    );
  });

  it("returns true if multiple operations match", () => {
    const mock = mockUserOperationsClient(undefined, [
      { operation: "use", targetType: "application" },
      { operation: "administer", targetType: "application" }
    ]);
    return isUserOperationAuthorizedConfluence(mock, testUserId, [
      "use",
      "administer"
    ]).then(result => {
      expect(result).toBe(true);
    });
  });

  it("returns false if operation missing", () => {
    const mock = mockUserOperationsClient(undefined, [
      { operation: "use", targetType: "application" }
    ]);
    return isUserOperationAuthorizedConfluence(mock, testUserId, [
      "use",
      "administer"
    ]).then(result => {
      expect(result).toBe(false);
    });
  });
});
