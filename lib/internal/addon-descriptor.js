var path = require('path')
var utils = require('./utils');

module.exports = function(addon){
    return utils.replaceTokensInJson(utils.loadJSON('addon.json'),
        '%%BASE_URI%%', addon.config.localBaseUrl());
}