const {
  isAuthorizedJira,
  isContentOperationAuthorizedConfluence,
  isUserOperationAuthorizedConfluence
} = require("../internal/authorization");

/**
 * Authorize the current request against Jira using the current user
 * The "current issue" and "current project" are used as inputs into the API
 * e.g. app.get('/example', [addon.authenticate(), addon.authorizeJira({ global: ["ADMINISTER"]})]) ...
 */
function authorizeJira(addon, permissions) {
  return function (req, res, next) {
    const accountId = req.context.userAccountId;
    const jiraContext = req.context.context.jira || {};
    const currentProject = jiraContext.project || {};
    const currentIssue = jiraContext.issue || {};
    const projectPermissions = permissions.project || [];
    const globalPermissions = permissions.global || [];

    // missing context
    if (
      projectPermissions &&
      projectPermissions.length > 0 &&
      !currentProject.id &&
      !currentIssue.id
    ) {
      addon.logger.warn(
        "Authorization failed: missing project or issue context"
      );
      res.status(401).send("Unauthorized: permissions could not be determined");
      return;
    }

    const projectPermissionLookup =
      projectPermissions.length > 0
        ? [
            {
              permissions: projectPermissions,
              projects: currentProject.id ? [currentProject.id] : [],
              issues: currentIssue.id ? [currentIssue.id] : []
            }
          ]
        : [];

    const httpClient = addon.httpClient(req);
    isAuthorizedJira(
      httpClient,
      accountId,
      globalPermissions,
      projectPermissionLookup
    )
      .then(result => {
        if (result) {
          next();
          return;
        }

        res.status(401).send("Unauthorized");
      })
      .catch(err => {
        addon.logger.warn("Authorization check failed", err);
        res
          .status(401)
          .send("Unauthorized: permissions could not be determined");
      });
  };
}

/**
 * Authorize the current request against Confluence using the current user
 * The "current content" is used as input into the API
 */
function authorizeConfluence(addon, permissions) {
  return function (req, res, next) {
    const accountId = req.context.userAccountId;
    const confluenceContext = req.context.context.confluence || {};
    const currentContent = confluenceContext.content || {};
    const contentOperation = permissions.content;
    const applicationOperations = permissions.application || [];

    // missing context
    if (contentOperation && !currentContent.id) {
      addon.logger.warn("Authorization failed");
      res.status(401).send("Unauthorized: permissions could not be determined");
      return;
    }

    const httpClient = addon.httpClient(req);
    const userOperationsAuthorized =
      applicationOperations.length > 0
        ? isUserOperationAuthorizedConfluence(
            httpClient,
            accountId,
            applicationOperations
          )
        : Promise.resolve(true);
    const contentOperationAuthorized = contentOperation
      ? isContentOperationAuthorizedConfluence(
          httpClient,
          accountId,
          currentContent.id,
          contentOperation
        )
      : Promise.resolve(true);

    Promise.all([userOperationsAuthorized, contentOperationAuthorized])
      .then(result => {
        if (result[0] && result[1]) {
          next();
          return;
        }

        res.status(401).send("Unauthorized");
      })
      .catch(err => {
        addon.logger.warn("Authorization check failed", err);
        res
          .status(401)
          .send("Unauthorized: permissions could not be determined");
      });
  };
}

module.exports = {
  authorizeJira,
  authorizeConfluence
};
