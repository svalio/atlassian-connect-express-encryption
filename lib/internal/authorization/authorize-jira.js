const _ = require("lodash");

function getGrants(
  httpClient,
  accountId,
  globalPermissions,
  projectPermissions
) {
  return new Promise((resolve, reject) =>
    httpClient.post(
      {
        url: "/rest/api/3/permissions/check",
        headers: {
          "X-Atlassian-Token": "nocheck"
        },
        // don't authenticate the request if there's no user ID associated
        // this allows anonymous users to have their permissions looked up
        anonymous: !accountId,
        json: {
          globalPermissions,
          projectPermissions,
          accountId
        }
      },
      (err, httpResponse, body) => {
        if (err) {
          reject(err);
          return;
        }

        if (body.errors) {
          reject(body.errors);
          return;
        }

        if (body.errorMessages) {
          reject(body.errorMessages);
          return;
        }

        resolve({
          projectPermissions: body.projectPermissions || [],
          globalPermissions: body.globalPermissions || []
        });
      }
    )
  );
}

// Normalizes the given array such that all elements are strings, and in sorting order. This is useful for comparing project/issue ids consistently.
function normalize(a) {
  return _.sortBy(_.map(a, item => item.toString()));
}

function checkProjectGrantsSatisfy(projectGrants, requiredProjectPermissions) {
  // every permission must be matched at least once with matching project IDs + issue IDs
  for (const projectPermission of requiredProjectPermissions) {
    let satisifed = false;
    const projectIds = normalize(projectPermission.projects);
    const issueIds = normalize(projectPermission.issues);

    for (const permissionName of projectPermission.permissions) {
      for (const grantedProjectPermission of projectGrants) {
        if (
          permissionName === grantedProjectPermission.permission &&
          _.isEqual(projectIds, normalize(grantedProjectPermission.projects)) &&
          _.isEqual(issueIds, normalize(grantedProjectPermission.issues))
        ) {
          satisifed = true;
          break;
        }
      }

      if (!satisifed) {
        return false;
      }
    }
  }

  return true;
}

function checkGrantsSatisify(
  grants,
  requiredGlobalPermissions,
  requiredProjectPermissions
) {
  // If an invalid permission is requested checking for equality will ensure no match is made
  if (
    !_.isEqual(
      _.sortBy(grants.globalPermissions),
      _.sortBy(requiredGlobalPermissions)
    )
  ) {
    return false;
  }

  if (
    !checkProjectGrantsSatisfy(
      grants.projectPermissions,
      requiredProjectPermissions
    )
  ) {
    return false;
  }

  return true;
}

/**
 * Determins if the given account satisfies the requested permissions
 */
function isAuthorized(
  httpClient,
  accountId,
  globalPermissions,
  projectPermissions
) {
  return getGrants(
    httpClient,
    accountId,
    globalPermissions,
    projectPermissions
  ).then(grants =>
    checkGrantsSatisify(grants, globalPermissions, projectPermissions)
  );
}

module.exports = {
  isAuthorized
};
