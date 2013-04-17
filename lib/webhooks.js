var registration = require("./registration");

module.exports = function (app, plugin) {

  plugin.on("remote_plugin_installed", function (key, settings) {

    console.log("Registration complete.");

    if (app.settings.env === "development") {
      process.once("SIGINT", function () {
        console.log();
        registration.deregister(plugin, function () {
          process.exit(1);
        });
      });
    }

  });

};
