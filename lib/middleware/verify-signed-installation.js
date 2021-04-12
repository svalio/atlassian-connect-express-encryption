// Handles the lifecycle "installed" event of a connect addon.

const urls = require("url");
const _ = require("lodash");

function verifySignedInstallation(addon) {
  return function (req, res, next) {
    if (!addon.signedInstall) {
      return next();
    }

    function sendError(msg) {
      const code = 401;
      addon.logger.error("Installation verification error:", code, msg);
      if (addon.config.expressErrorHandling()) {
        next({
          code,
          message: msg
        });
      } else {
        res.status(code).send(_.escape(msg));
      }
    }

    const regInfo = req.body;
    if (!regInfo || !_.isObject(regInfo)) {
      sendError("No registration info provided.");
      return;
    }

    // verify that the specified host is in the registration whitelist;
    // this can be spoofed, but is a first line of defense against unauthorized registrations
    const baseUrl = regInfo.baseUrl;
    if (!baseUrl) {
      sendError("No baseUrl provided in registration info.");
      return;
    }

    const host = urls.parse(baseUrl).hostname;
    const whitelisted = addon.config.whitelistRegexp().some(re => {
      return re.test(host);
    });
    if (!whitelisted) {
      return sendError(
        `Host at ${baseUrl} is not authorized to register as the host does not match the ` +
          `registration whitelist (${addon.config.whitelist()}).`
      );
    }

    addon.verifyInstallHook()(req, res, () => {
      next();
    });
  };
}

module.exports = verifySignedInstallation;
