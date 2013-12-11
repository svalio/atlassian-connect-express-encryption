exports.productPublicKey = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArVjfm73LwTC/S8M/Mwx9RYhNdEYqodULD/+jrT+Ser4PhcYw51DY3xbR3boZIn0GdNzVzWfoXoaiq24hvNsnxJc4pRyUn8RKr3DjTdqeuR64CWTqAckNjXUpWscj2ryCnLpl6zAbE3agE96wrt4KeBGxnvriZaROEpJmWpNt7f4NdKwwuLFB7ci9L0xY1AbE7UHDwiJJ9B+n1Gk1xEeHPnzpPN4HFI7M9GYMWpzP+9BuHuiFv4aVBawbd+BxFQhQ+m5kELGmX9zW+Tcj/pOGY3kfGxZ6TekHE22TUM8v4wNbNbB+QrXV2dd2Q4w0JfPSQR8m6aSDO2EmjnLQSNcEZQIDAQAB';
exports.productBaseUrl = "http://admin:admin@localhost:3001/confluence";

exports.installedPayload = {
    "baseUrl": this.productBaseUrl,
    "key": "my add-on key",
    "clientKey": "clientKey",
    "sharedSecret": "sharedSecret",
    "publicKey": this.productPublicKey,
    "eventType": "installed"
};

exports.clientInfo = {
  baseUrl: 'http://localhost:3002',
  publicKey: this.productPublicKey,
  description: 'host.consumer.default.description',
  pluginsVersion: '0.6.1010',
  clientKey: 'testHostClientKey',
  serverVersion: '4307',
  key: 'testKey',
  productType: 'test'
};

exports.consumerInfo = '\
<?xml version="1.0" encoding="UTF-8"?>\n\
<consumer>\n\
  <key>testHostClientKey</key>\n\
  <name>Confluence</name>\n\
  <publicKey>' + this.productPublicKey + '</publicKey>\n\
  <description>Atlassian Confluence</description>\n\
</consumer>\
';

// Allows us to run tests from a different dir
process.chdir(__dirname);
