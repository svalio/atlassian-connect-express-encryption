# Atlassian Connect for Express.js Release Notes

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
