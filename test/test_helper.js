exports.productBaseUrl = "http://admin:admin@localhost:3001/confluence";

exports.addonPort = 3001;
exports.addonBaseUrl = "http://localhost:" + exports.addonPort;

exports.installedPayload = {
    "baseUrl": this.productBaseUrl,
    "key": "my add-on key",
    "clientKey": "clientKey",
    "sharedSecret": "sharedSecret",
    "publicKey": this.productPublicKey,
    "eventType": "installed"
};

// Allows us to run tests from a different dir
process.chdir(__dirname);
