const utils = require("./utils");

module.exports = function (addon) {
  const firstPass = utils.replaceTokensInJson(
    utils.loadJSON(addon.descriptorFilename),
    "{{localBaseUrl}}",
    addon.config.localBaseUrl()
  );
  const secondPass = utils.replaceTokensInJson(
    firstPass,
    "{{environment}}",
    addon.config.environment()
  );
  const thirdPass = utils.replaceTokensInJson(
    secondPass,
    "{{appKey}}",
    addon.config.appKey()
  );

  if (addon.config.product().isBitbucket) {
    // Omit unsupported field for bit bucket apps.
    delete thirdPass.apiMigrations;
  } else if (
    addon.config.signedInstall() === "enable" ||
    addon.config.signedInstall() === "force"
  ) {
    // Adding signedInstall field only if it was configured in config.json.
    const signedInstallObject = {
      "signed-install": true
    };

    // Descriptor configuration takes precedence over config.json setting.
    thirdPass.apiMigrations = utils.merge(
      signedInstallObject,
      thirdPass.apiMigrations
    );
  }

  let finalResult = thirdPass;
  if (typeof addon.config.descriptorTransformer === "function") {
    finalResult = addon.config.descriptorTransformer()(thirdPass, addon.config);
  }
  return finalResult;
};
