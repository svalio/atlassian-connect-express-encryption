

module.exports = function (addon) {
    var product = addon.config.product();

    if (product.isJIRA || product.isConfluence) {
        return require('./register-jira-conf'); 
    } else if (product.isBitbucket) {
        return require('./register-bitbucket');
    } else {
        throw new Error('Not sure how to register against ' + product);
    }
};

