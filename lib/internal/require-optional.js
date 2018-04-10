var RSVP = require('rsvp');

exports.requireOptional = function requireOptional(moduleName) {
    return new RSVP.Promise(function (resolve, reject) {
        try {
            resolve(require(moduleName));
        } catch (err) {
            reject(err);
        }
    });
};
