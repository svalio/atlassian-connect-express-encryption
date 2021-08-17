const _ = require("lodash");

function isContentOperationAuthorized(
  httpClient,
  accountId,
  contentId,
  operation
) {
  return new Promise((resolve, reject) => {
    // make sure the content ID is valid to prevent traversal
    if (!/^[A-Z0-9-]+$/i.test(contentId)) {
      reject(new Error("Invalid content ID"));
      return;
    }
    httpClient.post(
      {
        url: `/rest/api/content/${encodeURIComponent(
          contentId
        )}/permission/check`,
        headers: {
          "X-Atlassian-Token": "no-check"
        },
        json: {
          subject: {
            type: "user",
            identifier: accountId
          },
          operation
        }
      },
      (err, httpResponse, body) => {
        if (err) {
          reject(err);
          return;
        }

        if (body.errors && body.errors.length > 0) {
          reject(body.errors);
          return;
        }

        resolve(body.hasPermission);
      }
    );
  });
}

function getUserOperations(httpClient, accountId) {
  return new Promise((resolve, reject) =>
    httpClient.get(
      {
        url: `/rest/api/user?accountId=${encodeURIComponent(
          accountId
        )}&expand=operations`,
        json: true
      },
      (err, httpResponse, body) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(body.operations);
      }
    )
  );
}

function isUserOperationAuthorized(
  httpClient,
  accountId,
  applicationOperations
) {
  return getUserOperations(httpClient, accountId).then(grants => {
    for (const operation of applicationOperations) {
      if (
        !_.find(
          grants,
          grant =>
            grant.operation === operation && grant.targetType === "application"
        )
      ) {
        return false;
      }
    }
    return true;
  });
}

module.exports = {
  isContentOperationAuthorized,
  isUserOperationAuthorized
};
