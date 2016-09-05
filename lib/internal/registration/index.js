

module.exports = function (addon) {
    var product = addon.config.product().id;

    if (product === 'jira' || product === 'confluence') {
        return require('./register-jira-conf'); 
    } else if (product === 'bitbucket') {
        return require('./register-bitbucket');
    } else {
        throw new Error('Not sure how to register against ' + product);
    }
};

