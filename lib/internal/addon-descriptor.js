var utils = require('./utils');

module.exports = function (addon) {
    return utils.replaceTokensInJson(utils.loadJSON('atlassian-connect.json'),
            '%%BASE_URI%%', addon.config.localBaseUrl());
};
