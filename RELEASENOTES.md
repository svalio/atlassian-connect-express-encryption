# Release notes for Atlassian Connect Express

### 1.0.0-beta5

* The token mechanism for iframe to add-on service communication is using JWT now. The old token mechanism continues to
work, but is deprecated. Please see the updated [README.md](README.md) for details.

* __Breaking Change__: We removed support for sessions in ACE, in favor of the standard JWT token approach. 
If your code relies on `req.session.*`, you will need to change that to `req.context.*` or `res.locals.*`.