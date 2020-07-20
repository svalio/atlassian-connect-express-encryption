const assert = require("assert");

const { getVerifiedClaims } = require("../lib/middleware/authentication");


describe("authentication", function() {

  it("exports getVerifiedClaims for apps that need the claims manually", function() {

    assert(getVerifiedClaims);

  });

});
