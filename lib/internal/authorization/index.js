const { isAuthorized: isAuthorizedJira } = require("./authorize-jira");
const {
  isContentOperationAuthorized: isContentOperationAuthorizedConfluence,
  isUserOperationAuthorized: isUserOperationAuthorizedConfluence
} = require("./authorize-confluence");

module.exports = {
  isAuthorizedJira,
  isContentOperationAuthorizedConfluence,
  isUserOperationAuthorizedConfluence
};
