var registration = require("./registration");

module.exports = function (app, plugin) {

  plugin.on("remote_plugin_installed", function (key, settings) {

    console.log("Registration complete.");

    if (app.settings.env === "development") {
      process.once("SIGINT", function () {
        console.log("Unregistering plugin...");
        registration.deregister(plugin, function () {
          console.log("Plugin unregistered.")
          process.exit(1);
        });
      });
    }

  });

};
