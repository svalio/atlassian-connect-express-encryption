var RSVP = require('rsvp');

module.exports = function (moduleName) {
    return new RSVP.Promise(function (resolve, reject) {
        try {
            resolve(require(moduleName));
        } catch (err) {
            reject(err);
        }
    });
};
