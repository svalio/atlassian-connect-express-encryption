const jwt = require("atlassian-jwt");
const moment = require("moment");

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
-----END PRIVATE KEY-----`;

exports.otherPrivateKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCtadPYu6IBj//6
7Fa2qUl/Pm2E7EBiHyvA+TUGykrRigMQ4jE7UwMirXGKksHZtm/32WZJNOJ/HxRu
FJ0XApStiEz5srPGGiiiajsm98n4cvFKOvRq0vkN4jZAuLjWFJ4YC9Q3PfDjTh5N
kYz/2TPZEbAjyig1RlB2eTkstqw0P64PRjO+5tR17dAkUmR6oJ3kNlVJXEPQZZ/3
lEkL/s/n3EHobBDM4fy+s8/pnxAhHzsvbrMQl09Nc5LWMohOFGq+aRDfEtdmS50r
5Kop50DpHErylzCX7IYNIAk5oHb3eJEOu7SeA1PQNv9rssRVcwow8FTirm5gHzAX
yqTJa7t3AgMBAAECggEBAJxNLJLG3AjIgBLsfmP5RbOY0yHhx04phkhS1kaegr1G
xeir12//LG5PIm2iRXM0Csu8eYM2VYf6vXFSxxx8SQH4Plk5huvhnAp38YT4BmUX
RQCBDthR/AVVhUzkskTTJIPL9aUtATf/qzSDIjFg1miqlrZLed462D9QmAYDSEd2
Ofqz0KbHdSoV+nxsSALUaRn8zxjNA5QyO+0fPBh/2+KpUskbhIkj2v2Xmoh4wfvI
/XiWkmFqNYw9fQ5QqgsdD7FFOAmpJf2c+6fd/0kOnWHNlojKU2kg08aIzPn6zO7j
f4TUgui3eEFUxnD5lDKfiIstZolMvbH0havGfQIIefECgYEA3F7H5GSpRYIVK0SS
MfHqn5siUqqVGpAI2EmAMItd3eHF/wOOudXo9JO7UZnihWBaZvEAhNQGdK6hk4V3
Pmt7gotYB4KZYSaI0olmVHpBAoji8xm04baCTo8ni8vE2L2bq8eLhfwNt2BnKhcF
iAPMI1hTanh0iFa1iF64SPEttNsCgYEAyXN7g1skNKeTCkIXSdP0BzhZlL3gjBEA
xaMgTZ6BotVlNX3tB54wIb1q0dDK7aqO29AFcd7dmiXx6i80ymbeuMKDQyUVNE+K
YHOyvAnI+SDBSR6B/fGu4NOhgNLPtGhw7d//04etZ7L5JzTvgO5zlYFqkzTT5JqE
d0cpDCAx6JUCgYA0PKdnhVD2sAoyknORMUYrhUuSiusDO+dM1cd0OmUKxoz3kTFQ
7drltustQawHb7qeMjysP9Iz8H1OidGlUzcYz80TIqsW81p1hapjFgO5BRe/BnXx
FyE2XArEwY2szu1Kv+db4E6kDE8IFCL0henq6vIDCACfnOY1KDbI25q5BwKBgCP5
Kko3oUyBzCEd0jjNz5rmdiC4k3uPobqpOaCCuJWSU8NsnEIq/l9YCtYy2bn9Jguc
pwxBhwL62as/CMdH/Wey3GvGGHZB6ez1XCp1+Nx7++gJuZ7WZKsjP4jYnFyT9e6U
fIOSi+WjsRhOPKKiciN1e8mTum7tJNCD9ZGDwkXNAoGAKuScwYyVpTLCORcw9geU
8WIlmBS03CeYn6gSf5OugJUl/R0QDLRdI29k0/4YNjn10TeKHDHW8YRzJChV7kNV
Y6daFgV4PaTOnIBo9WxkH3q5QHUW/S0/BRiLJNSmAOB58d46UnHUwJK32qWMnKV4
aWvLcyh01NF3IKCsdHBTaZ8=
-----END PRIVATE KEY-----`;

exports.publicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs/50oVGrCSs5x4WJrjtU
InChsoodEh93IbOGllw4861njn1mbxdhIS7M7CcaaOVJ1IHAdkH012dsY9Tpy5Ut
q0QdcxSJoQ99w9GfDfyOgVbt8qspbF3o/L4k2LQ/srUmtxj8UF7/s4XU0rswakxY
XDKp6KuiM0blUs6Q2n6Wp8IK0bhfotuEJs9aokDZIPo1dH7Mkwg0F9Wv/axUAIWF
/UW74kM9akNskkt45WwrIfvqoNZMbPcpjE2E7D9KKemEO1TVQPvNw4yLU6+NGEW3
/IrGlu4L4IWJLxv+6qTFSWpL6PIrI+2jqhPb9c9M/p49HyXvxmAqSmTfaoRvIeof
awIDAQAB
-----END PUBLIC KEY-----`;

exports.keyId = "d2466692-d9b3-4245-8208-a601568541ae";

exports.userId = "admin";
exports.userAccountId = "048abaf9-04ea-44d1-acb9-b37de6cc5d2f";

exports.createJwtTokenForInstall = function create_jwt_token_singed_install(
  req,
  iss,
  context,
  header,
  privateKeyParam,
  aud
) {
  const jwtPayload = {
    sub: this.userAccountId,
    iss: iss || this.installedPayload.clientKey,
    aud: aud || this.addonBaseUrl,
    iat: moment().utc().unix(),
    exp: moment().utc().add(10, "minutes").unix()
  };

  jwtPayload.context = context
    ? context
    : {
        user: {
          accountId: this.userAccountId,
          userKey: this.userId,
          userId: this.userId
        }
      };

  if (req) {
    jwtPayload.qsh = jwt.createQueryStringHash(jwt.fromExpressRequest(req));
  }

  return jwt.encodeAsymmetric(
    jwtPayload,
    privateKeyParam || this.privateKey,
    jwt.AsymmetricAlgorithm.RS256,
    header || { kid: this.keyId }
  );
};

exports.createJwtToken = function create_jwt_token(req, secret, iss, context) {
  const jwtPayload = {
    sub: this.userAccountId,
    iss: iss || this.installedPayload.clientKey,
    iat: moment().utc().unix(),
    exp: moment().utc().add(10, "minutes").unix()
  };

  jwtPayload.context = context
    ? context
    : {
        user: {
          accountId: this.userAccountId,
          userKey: this.userId,
          userId: this.userId
        }
      };

  if (req) {
    jwtPayload.qsh = jwt.createQueryStringHash(jwt.fromExpressRequest(req));
  }

  return jwt.encodeSymmetric(
    jwtPayload,
    secret || this.installedPayload.sharedSecret
  );
};

// Allows us to run tests from a different dir
process.chdir(__dirname);
