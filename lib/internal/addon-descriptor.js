const { DESCRIPTOR_FILENAME } = require("../index");

const utils = require("./utils");

module.exports = function (addon) {
  const firstPass = utils.replaceTokensInJson(
    utils.loadJSON(DESCRIPTOR_FILENAME),
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

  let finalResult = thirdPass;
  if (typeof addon.config.descriptorTransformer === "function") {
    finalResult = addon.config.descriptorTransformer()(thirdPass, addon.config);
  }
  return finalResult;
};
