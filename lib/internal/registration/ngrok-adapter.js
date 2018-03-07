var ngrok = undefined;
var initializationAttempted = false;

function initializeIfNeeded() {
    if (!initializationAttempted) {
        try {
            ngrok = require('ngrok');
        } finally {
            initializationAttempted = true;
        }
    }
}

exports.connect = function connect(port, callback) {
    try {
        initializeIfNeeded();
    } catch (err) {
        return callback(err);
    }
    ngrok.connect(port, callback);
}

exports.kill = function kill() {
    if (initializationAttempted && ngrok) {
        ngrok.kill();
    }
}