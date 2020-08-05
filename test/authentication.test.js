const { getVerifiedClaims } = require("../lib/middleware/authentication");

describe("authentication", () => {
  it("exports getVerifiedClaims for apps that need the claims manually", () => {
    expect(getVerifiedClaims).not.toBeUndefined();
  });
});
