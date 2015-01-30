var utils = require('./utils');

module.exports = function (addon) {
    var firstPass = utils.replaceTokensInJson(utils.loadJSON('atlassian-connect.json'), '{{localBaseUrl}}', addon.config.localBaseUrl());
    var secondPass = utils.replaceTokensInJson(firstPass, '{{addonSuffix}}', addon.config.addonSuffix());
    return secondPass;
};
