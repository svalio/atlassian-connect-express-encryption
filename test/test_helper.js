exports.productBaseUrl = "http://admin:admin@localhost:3001/confluence";

exports.addonPort = 3001;
exports.addonBaseUrl = `http://localhost:${exports.addonPort}`;

exports.installedPayload = {
  baseUrl: this.productBaseUrl,
  key: "my add-on key",
  clientKey: "clientKey",
  sharedSecret: "sharedSecret",
  publicKey: this.productPublicKey,
  eventType: "installed"
};

exports.privateKey = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCz/nShUasJKznH
hYmuO1QicKGyih0SH3chs4aWXDjzrWeOfWZvF2EhLszsJxpo5UnUgcB2QfTXZ2xj
1OnLlS2rRB1zFImhD33D0Z8N/I6BVu3yqylsXej8viTYtD+ytSa3GPxQXv+zhdTS
uzBqTFhcMqnoq6IzRuVSzpDafpanwgrRuF+i24Qmz1qiQNkg+jV0fsyTCDQX1a/9
rFQAhYX9RbviQz1qQ2ySS3jlbCsh++qg1kxs9ymMTYTsP0op6YQ7VNVA+83DjItT
r40YRbf8isaW7gvghYkvG/7qpMVJakvo8isj7aOqE9v1z0z+nj0fJe/GYCpKZN9q
hG8h6h9rAgMBAAECggEAIV3ZVxJhp3h45JDPvhnHdf71KrjJvNNSbU/vci40bI/H
s7VxaMSnv9QCLwDst2dR8XAAMqv1bH0CrdsJYDEOX0JoRy4WeWH6yXMxjhE0hauM
vsCWFD2wdDH3eKipakKEo8qg83E465myo0IKLppqguTtdHFkxyasWlZqqeZvnTde
qoKdwXgyeZCBXwsOhZ89D2ACnQ8YvMwaHD8J0uUzGjiW+Q7CIMcrb9FU/QeSWAOs
178nxurgjcBRebgGKoJIcoaWKWeIQWDR3cGv9tA00I0O2ujC1Gn7WzJAjBTEHWTj
+4Bwr5jLVG91UK8cbknWjnY7df16RSCTm+xzrUXWUQKBgQDmdea4LvYHPT/FNzFA
zWds7f3npKiQbQg+/pim9y0dD45bXLykXFhoAXv6QxmsiRqioh7/Rm4MwluCe9oS
fsfbLq8O4XmsDmTfF1it6ulBzMjm2ilHhHZSWgLhMvGNbdIh3fxKM/CfUEQkqPXV
IdK+Ubo+In5ILDd9NxgnkiAjSQKBgQDH8NT/uGFkAriMY1GO/5uTr4y3OaXVW0Kf
folRVXoVHhp5HqNrhzi0Y10fISl7K9VmWbQhLCB7SDsPcILjif9QfTY6WhQKC8d0
TJ24gAWXRjOMFVyzDlna3y26x2m3S8esR1fQ4UqP9479MSb9Eb4OCp4JKtOnhpyg
akAO+Ap5EwKBgQCf0GzhlrdIB+JcGc0O+iHZuSRU6at3FBUe0iD7z/a561q14pZy
iBNKdJUL1FJOgnk1BKXoMmgIcxNQZiCwqLhhN3twH03n0ceDqUX2vStqVN+QrwLn
NGV08DSFBHXbtKd+ktjsgB5B7ECFB6IKXb0t+7Die7sEw5zrOTSH5F5i+QKBgHV3
4Sx8v3tqvdJ9Z6WEN3uFYD8l93BqtbHPPg4zEg7mKNeQUKMURxR0bHmlmiFrl20S
tunmaw8DWO+xQrU8lmxLpFiUI8HjOcPyX5fOX3qJHC/pPRVWESSuisd58XpnY2Cs
acOnGY+L+s522llE20yUoFTyfHeods0on4or4LtRAoGBAJ59exQUwI1cCoTPI4Qc
vMMlMHLZ9I+eIbizu+1NsjbJ/9ECMpInC4fYc1Hl30eHOaWpM/yI23Rzx9dvveaW
9eBqYOZZ2iV/+znVxkwX8wi/l6DoH6s3zS4qVmV6T2nQFg4iYicnagDjGfXqb0qq
zHE5ZWQj3r8Ek2o4PlbGHGAO
-----END PRIVATE KEY-----`

exports.publicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs/50oVGrCSs5x4WJrjtU
InChsoodEh93IbOGllw4861njn1mbxdhIS7M7CcaaOVJ1IHAdkH012dsY9Tpy5Ut
q0QdcxSJoQ99w9GfDfyOgVbt8qspbF3o/L4k2LQ/srUmtxj8UF7/s4XU0rswakxY
XDKp6KuiM0blUs6Q2n6Wp8IK0bhfotuEJs9aokDZIPo1dH7Mkwg0F9Wv/axUAIWF
/UW74kM9akNskkt45WwrIfvqoNZMbPcpjE2E7D9KKemEO1TVQPvNw4yLU6+NGEW3
/IrGlu4L4IWJLxv+6qTFSWpL6PIrI+2jqhPb9c9M/p49HyXvxmAqSmTfaoRvIeof
awIDAQAB
-----END PUBLIC KEY-----`

exports.keyId = "d2466692-d9b3-4245-8208-a601568541ae"

// Allows us to run tests from a different dir
process.chdir(__dirname);
