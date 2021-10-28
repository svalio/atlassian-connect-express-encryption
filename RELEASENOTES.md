# Atlassian Connect for Express.js Release Notes

## 7.4.8
* BaseUrl modified by the 'descriptorTransformer' function should be allowed for a JWT audience check

## 7.4.7
* Fix for global permissions check when there is neither project nor issue in the context

## 7.4.6
* Add support to the authorization middleware for checking anonymous Jira user permissions

## 7.4.4, 7.4.5
* TS type signature fix: AddOnFactory

## 7.4.3
* Add request context for installation middleware
* Add test support for 1st party apps

## 7.4.1
* `addon.authenticateInstall` middleware supports uninstall hook sent from an old version.

## 7.4.0
* Removed default opt-in to signed-install feature: Manually opt-in from the app descriptor
* Support multiple baseUrls when verifying install callback audience claim. 

## 7.3.0

* TS type signature fix: HostClient#getAllClientInfos()
* TS type signature addition: ConfigOptions#watch
* TS type signature addition: HostClient#getUserBearerToken
* TS type signature addition: addon.authenticateInstall()

## 7.2.0

* Add and adjust type signatures for store and client methods

## 7.1.8
* Remove lockfiles
* Fixed typo in auth error message

## 7.1.7
* Patch to remove an unsupported descriptor field for bitbucket apps.
* Fixing minor bug which fails to check bitbucket apps

## 7.1.5
* Add config to control whether to use secure install hook only.
* Add authorization middleware for Jira and Confluence

## 7.1.4
* Update install lifecycle to check audience(app base url).

## 7.1.3
* Fixed typescript definition

## 7.1.2
* Removed `esModuleInterop` requirement from typescript typings

## 7.1.1
* Fixed `@aws-sdk/client-dynamodb` dependency issue

## 7.1.0
* Added dynamoDB storage adapter

## 7.0.1

* Install lifecycle callback uses asymmetric JWT
* Bug fix for missing context qsh check in v7.0.0

## 6.6.0

* Enforce presence of qsh claim on lifecycle endpoints

## 6.5.0

* Type updates

## 6.4.0

* Use registered installation keys over a pre-configured key

## 6.3.0

* Type and style updates

## 6.2.2

* Fix "TypeError: Promise.resolve is not a constructor".

## 6.2.1

* Fix the bug that causes sequelize adapter to always insert a new record instead of updating the existing one; this breaks reinstallation:
  https://community.developer.atlassian.com/t/i-found-a-bug-in-atlassian-connect-express-sequelize-storage-adapter-how-do-i-report-it/42399

## 6.2.0

* Allow custom table name with sequelize.

## 6.1.0

* Add Redis storage adapter.

## 6.0.0

* Update all package versions to latest.
  * [sequelize](https://www.npmjs.com/package/sequelize) is updated to v6 from v5,
    see [breaking changes](https://github.com/sequelize/sequelize/blob/master/docs/manual/other-topics/upgrade-to-v6.md).
  * [rsvp](https://www.npmjs.com/package/rsvp) promise library is removed.
* A major version bump also because it removes `addon._` ([Lodash](https://lodash.com/) utilities).

## 5.0.0

* Update all package versions to latest.
* Fix [ACEJS-57](https://ecosystem.atlassian.net/browse/ACEJS-57) ACE fails to  start if descriptor contains double quote.
* A major version bump because it also raises the minimum node version for atlassian-connect-express from 8 to 10.

## 4.4.1

* Refactor and test library migration only

## 4.4.0

* Split out getVerifiedClaims as separate function

## 4.3.0

* Bump minor and patch dependencies to pick up security fixes
* Refactor auth class

## 4.2.0

* (Atlassian internal only) Use staging oauth 2 authorization server when performing user impersonation against dev jira or confluence sites

## 4.1.0
* Use {{appKey}} variable in atlassian-connect.json
* Use the correct sqlite dialect string.
* Set urijs to static version because of recent bug in library
* Add retryWrites=false and correct option order
* Bumping Sequilize to fix the vulnerability
* Handle errors thrown by store adapter during installation verification
* Add eslint support / Add some more eslint rules
* bump atlassian-oauth2 for new oauth-2-authorisation-server service URL
* Add back colors import
* Allow the import of dialectOptions via config

## 4.0.1

* Moved ngrok dependency back to dev

## 4.0.0

* Corrected version and incrementing major version due to drop of ngrok 2 in support of 3 from ACE version 3.5.0 (breaking change)
* Support for the qs parameter

## 3.5.2

Security fixes - updated Bitbucket

## 3.5.1

Security fixes

## 3.5.0

* Fixes dependency on ngrok 3, and drops support for ngrok 2

## 3.4.3

* Add descriptor validator - app developer should add a 'validateDescriptor' in config file to enable this in development mode

## 3.4.2

* Allow passing of Sequelize pool options
* Alignment of Jira, Conf, and Bitbucket SDK
* Documented events

## 3.4.0

* Updates dependency libraries to fix `npm audit` warnings

## 3.3.0

* Added MongoDB storage adapter

## 3.2.0

* Expose JWT `context` claim as context variable
* `userAccountId` context variable now set for JWT with `context` claim without `user` field

## 3.1.0

* Deprecates existing (stored) `userKeys` for identifying users when using OAuth 2.0 JWT Bearer Tokens (`asUser()`).
* Introduces support for OAuth 2.0 JWT Bearer Token using Atlassian Account ID, using `asUserByAccountId()`.
* Please see migration guide on developer.atlassian.com for an overview of how to migrate from `userKey`
to `userAccountId`. The README.md also covers this
* Removes JWT User Impersonation logic altogether
* Deprecates `userId`, `locale` and `timezone` request context parameters.
* Introduces `userAccountId` request context parameter.
* Please see [ACEJS-115](https://ecosystem.atlassian.net/browse/ACEJS-115) for more details.

## 3.0.2

* Accept JWTs without query string hash claim

## 3.0.0

* Removes JugglingDB as the default adapter, replacing with Sequelize. This is in part due to Juggling
no longer being maintained, and (consequently) having several security issues as per npm audit. Removing
Juggling removes these issues.

## 2.0.1

* Fixes bug with auto registration for HipChat add-ons that are generated with `atlas-connect`.

## 2.0.0

* Adds support for Bitbucket add-ons.
* Adds support for user impersonation in JIRA and Confluence using OAuth 2.0
([AC-1080](https://ecosystem.atlassian.net/browse/AC-1080)).
To leverage this feature, use the `httpClient` as follows:

```javascript
var httpClient = addon.httpClient(req);
httpClient.asUser('barney').get('/rest/api/latest/myself', function (err, res, body) {
  ...
});
```

* Setting the JWT `sub` claim from the userKey is no longer supported. Please use the `asUser()` method instead.
* The attribute `appKey` in the render context is now `addonKey`.

## 1.0.1

* Explicit support for multipart form data and url-encoded form data: A bug caused some multipart form uploads (e.g.
for JIRA attachments) to fail. The ambiguous `options.form` parameter for HTTP requests back to the product host is
now deprecated. Please use these parameters instead:
  * `multipart/form-data`: Use `options.multipartFormData`
  * `application/x-www-form-urlencoded`: Use `options.urlEncodedFormData`

## 1.0.0-beta5

* The token mechanism for iframe to add-on service communication is using JWT now. The old token mechanism continues to
work, but is deprecated. Please see the updated [README.md](README.md) for details.

* __Breaking Change__: We removed support for sessions in ACE, in favor of the standard JWT token approach.
If your code relies on `req.session.*`, you will need to change that to `req.context.*` or `res.locals.*`.
