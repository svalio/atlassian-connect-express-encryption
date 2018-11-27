var moment = require('moment');
var jwt = require('atlassian-jwt');
var requestHandler = require('./request');
var _ = require('lodash');

var TOKEN_KEY_PARAM = 'acpt';
var TOKEN_KEY_HEADER = 'X-' + TOKEN_KEY_PARAM;

var JWT_PARAM = 'jwt';
var AUTH_HEADER = 'authorization'; // the header name appears as lower-case

var authentication = {};

authentication.authenticateWebhook = function (addon) {
    var self = this;
    return function (req, res, next) {
        addon.emit('webhook_auth_verification_triggered');

        self.authenticate(addon)(req, res, function () {
            addon.emit('webhook_auth_verification_successful');
            return next();
        });
    };
};

authentication.authenticate = function (addon, skipQshVerification) {

    function extractJwtFromRequest(req) {
        var tokenInQuery = req.query[JWT_PARAM];

        // JWT is missing in query and we don't have a valid body.
        if (!tokenInQuery && !req.body) {
            addon.logger.warn(
              'Cannot find JWT token in query parameters. ' +
              'Please include body-parser middleware and parse the urlencoded body ' +
              '(See https://github.com/expressjs/body-parser) if the add-on is rendering in POST mode. ' +
              'Otherwise please ensure the ' + JWT_PARAM + ' parameter is presented in query.');
            return;
        }

        // JWT appears in both parameter and body will result query hash being invalid.
        var tokenInBody = req.body[JWT_PARAM];
        if (tokenInQuery && tokenInBody) {
            addon.logger.warn('JWT token can only appear in either query parameter or request body.');
            return;
        }
        var token = tokenInQuery || tokenInBody;

        // if there was no token in the query-string then fall back to checking the Authorization header
        var authHeader = req.headers[AUTH_HEADER];
        if (authHeader && authHeader.indexOf('JWT ') == 0) {
            if (token) {
                var foundIn = tokenInQuery ? 'query' : 'request body';
                addon.logger.warn('JWT token found in ' + foundIn + ' and in header: using ' + foundIn + ' value.');
            }
            else {
                token = authHeader.substring(4);
            }
        }

        // TODO: Remove when we discontinue the old token middleware
        if (!token) {
            token = req.query[TOKEN_KEY_PARAM] || req.header(TOKEN_KEY_HEADER);
        }

        return token;
    }

    return function (req, res, next) {

        function sendError(code, msg) {
            addon.logger.warn('Authentication verification error:', code, msg);
            if (addon.config.expressErrorHandling()) {
                next({
                    code: code,
                    message: msg
                });
            } else {
                res.format({
                    text: function() {
                        res.status(code).send(_.escape(msg));
                    },
                    html : function() {
                        if (addon.config.errorTemplate()) {
                            res.statusCode = code;
                            res.render('unauthorized', {
                                message : msg
                            });
                        } else {
                            res.status(code).send(_.escape(msg));
                        }
                    },
                    json: function() {
                        res.status(code).send({
                            message: msg
                        });
                    }
                });
            }
        }

        if (/no-auth/.test(process.env.AC_OPTS)) {
            console.warn('Auth verification is disabled, skipping validation of request.');
            next();
            return;
        }

        var token = extractJwtFromRequest(req);
        if (!token) {
            sendError(401, 'Could not find authentication data on request');
            return;
        }

        try {
            var unverifiedClaims = jwt.decode(token, '', true); // decode without verification;
        } catch (e) {
            sendError(401, 'Invalid JWT: ' + e.message);
            return;
        }

        var issuer = unverifiedClaims.iss;
        if (!issuer) {
            sendError(401, 'JWT claim did not contain the issuer (iss) claim');
            return;
        }

        var request = req;
        var clientKey = issuer;

        // The audience claim identifies the intended recipient, according to the JWT spec,
        // but we still allow the issuer to be used if 'aud' is missing.
        // Session JWTs make use of this (the issuer is the add-on in this case)
        if (!_.isEmpty(unverifiedClaims.aud)) {
            clientKey = unverifiedClaims.aud[0];
        }

        addon.settings.get('clientInfo', clientKey).then(function (settings) {

            function success(verifiedClaims) {
                var token = createSessionToken(verifiedClaims);
                // Invoke the request middleware (again) with the verified and trusted parameters

                // Base params
                var verifiedParams = {
                    clientKey: clientKey,
                    hostBaseUrl: settings.baseUrl,
                    token: token
                };

                // Use the context.user if it exists. This is deprecated as per
                // https://ecosystem.atlassian.net/browse/AC-2424
                if(verifiedClaims.context) {
                    verifiedParams.context = verifiedClaims.context;
                    var user = verifiedClaims.context.user;
                    if(user) {
                        if(user.accountId) {
                            verifiedParams.userAccountId = user.accountId;
                        }
                        if(user.userKey) {
                            verifiedParams.userKey = user.userKey;
                        }
                    }
                }

                if (!verifiedParams.userAccountId) {
                    // Otherwise use the sub claim, and assume it to be the AAID.
                    // It will not be the AAID if they haven't opted in / if its before
                    // the end of the deprecation period, but in that case context.user
                    // will be used instead.
                    verifiedParams.userAccountId = verifiedClaims.sub;
                }

                var reqHandler = requestHandler(addon, verifiedParams);
                reqHandler(req, res, next);
            }

            // Create a JWT token that can be used instead of a session cookie
            function createSessionToken(verifiedClaims) {
                var now = moment().utc();
            
                var baseJwt = {
                    'iss': addon.key,
                    'iat': now.unix(),
                    'sub': verifiedClaims.sub,
                    'exp': now.add(addon.config.maxTokenAge(), 'milliseconds').unix(),
                    'aud': [ clientKey ]
                };
                
                // If the context.user exists, then send that too. This is to handle
                // the interim period swapover from userKey to userAccountId.
                if(verifiedClaims.context) {
                    baseJwt.context = verifiedClaims.context;
                }

                var token = jwt.encode(baseJwt, settings.sharedSecret);

                res.setHeader(TOKEN_KEY_HEADER, token);
                return token;
            }

            if (!settings) {
                sendError(401, 'Could not find stored client data for ' + clientKey + '. Is this client registered?');
                return;
            }
            var secret = settings.sharedSecret;
            if (!secret) {
                sendError(401, 'Could not find JWT sharedSecret in stored client data for ' + clientKey);
                return;
            }
            var verifiedClaims;
            try {
                verifiedClaims = jwt.decode(token, secret, false);
            } catch (error) {
                sendError(400, 'Unable to decode JWT token: ' + error);
                return;
            }

            var expiry = verifiedClaims.exp;

            // todo build in leeway?
            if (expiry && moment().utc().unix() >= expiry) {
                sendError(401, 'Authentication request has expired. Try reloading the page.');
                return;
            }

            // First check query string params
            const jwtRequest = jwt.fromExpressRequest(request);
            if (!skipQshVerification && verifiedClaims.qsh) {
                var expectedHash = jwt.createQueryStringHash(jwtRequest, false, addon.config.baseUrl.href);
                var signatureHashVerified = verifiedClaims.qsh === expectedHash;
                if (!signatureHashVerified) {
                    var canonicalRequest = jwt.createCanonicalRequest(jwtRequest, false, addon.config.baseUrl.href);

                    // If that didn't verify, it might be a post/put - check the request body too
                    expectedHash = jwt.createQueryStringHash(jwtRequest, true, addon.config.baseUrl.href);
                    signatureHashVerified = verifiedClaims.qsh === expectedHash;
                    if (!signatureHashVerified) {
                        canonicalRequest = jwt.createCanonicalRequest(jwtRequest, true, addon.config.baseUrl.href);

                        // Send the error message for the first verification - it's 90% more likely to be the one we want.
                        addon.logger.error(
                          'Auth failure: Query hash mismatch: Received: "' + verifiedClaims.qsh + '" but calculated "' + expectedHash + '". ' +
                          'Canonical query was: "' + canonicalRequest);
                        sendError(401, 'Authentication failed: query hash does not match.');
                        return;
                    }
                }
            }

            success(verifiedClaims);
        }, function (err) {
            sendError(500, 'Could not lookup stored client data for ' + clientKey + ': ' + err);
        });
    };
};

module.exports = authentication;
