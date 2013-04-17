var _ = require("underscore");

function options(callbacks) {
  // @todo get or generate defaults more intelligently
  var env = process.env;
  var hostBaseUrl = env.HOST_BASE_URL || "http://localhost:2990/jira";
  var localBaseUrl = env.LOCAL_BASE_URL || "http://rmanalang.local:3000";
  return _(callbacks).extend({
    hostBaseUrl: hostBaseUrl,
    localBaseUrl: localBaseUrl,
    user: env.HOST_ADMIN_USER || "admin",
    pass: env.HOST_ADMIN_PASS || "admin"
  });
}

exports.register = function (plugin) {
  console.log("Registering plugin...");
  plugin.register(options({
    success: function () {
      console.log("Registration initiated...");
    },
    error: function (err, detail) {
      var args = ["Failed to register with host server:"];
      if (err) args.push(err);
      if (detail) args.push(detail);
      console.error.apply(console, args);
    }
  }));
};

exports.deregister = function (plugin, next) {
  console.log("Deregistering plugin...");
  // @todo get all from common service (common to register in app.js)
  plugin.deregister(options({
    success: function () {
      console.log("Deregistration complete.");
      next();
    },
    error: function (err, detail) {
      var args = ["Deregistration failed."];
      if (err) args.push(err);
      if (detail) args.push(detail);
      console.error.apply(console, args);
      next();
    }
  }));
};
