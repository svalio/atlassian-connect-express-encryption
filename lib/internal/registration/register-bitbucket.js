const request = require("request");
const urls = require("url");
const _ = require("lodash");
const path = require("path");
const fs = require("fs");
const inquirer = require("inquirer");
const appDir = path.dirname(require.main.filename);

const credentialsFile = "credentials.json";
const credentialsErrorMessage = `Couldn't read bitbucket.username and bitbucket.password from ${credentialsFile}`;
let credentials;

/*
 Bitbucket (de-)registration end-points:

    GET https://api.bitbucket.org/2.0/account/USERNAME/addons

    POST https://api.bitbucket.org/2.0/account/USERNAME/addons
        {url: "http://pow-location-3.herokuapp.com/descriptor.json"}

    DELETE https://api.bitbucket.org/2.0/account/USERNAME/addons/ID
 */

function readCredentials() {
  return new Promise((resolve, reject) => {
    if (!credentials) {
      try {
        credentials = JSON.parse(
          fs.readFileSync(`${appDir}/${credentialsFile}`, "utf8")
        );
      } catch (e) {
        // fall through
      }
    }
    if (
      credentials &&
      credentials.bitbucket &&
      credentials.bitbucket.username &&
      credentials.bitbucket.password
    ) {
      resolve(credentials);
    } else {
      reject(credentialsErrorMessage);
    }
  });
}

function asRequestAuth(credentials) {
  return {
    user: credentials.bitbucket.username,
    pass: credentials.bitbucket.password
  };
}

function getRegisteredAddonId(addonKey) {
  return readCredentials().then(credentials => {
    return new Promise((resolve, reject) => {
      request.get(
        {
          uri: `https://api.bitbucket.org/2.0/account/${credentials.bitbucket.username}/addons`,
          auth: asRequestAuth(credentials)
        },
        (error, response, body) => {
          if (error) {
            reject(`Failed to list Bitbucket add-ons ${error}`);
          } else if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(
              `Failed to list Bitbucket add-ons ${
                response.statusCode
              } ${JSON.stringify(body)}`
            );
          } else {
            try {
              const data = JSON.parse(body);
              const registration = _.find(data.values, registered => {
                return registered.key === addonKey;
              });
              if (registration) {
                resolve(registration.id);
              } else {
                resolve(null);
              }
            } catch (e) {
              reject(
                "Bitbucket returned an unexpected response.\nIf you have 2FA enabled on your account you may need to install the add-on manually."
              );
              return;
            }
          }
        }
      );
    });
  });
}

function deregisterAddon(addonId) {
  return readCredentials().then(credentials => {
    return new Promise((resolve, reject) => {
      request.del(
        {
          uri: `https://api.bitbucket.org/2.0/account/${credentials.bitbucket.username}/addons/${addonId}`,
          auth: asRequestAuth(credentials)
        },
        (error, response, body) => {
          if (error) {
            reject(`Failed to uninstall Bitbucket add-on ${error}`);
          } else if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(
              `Failed to uninstall Bitbucket add-on ${
                response.statusCode
              } ${JSON.stringify(body)}`
            );
          } else {
            resolve();
          }
        }
      );
    });
  });
}

function registerAddon(descriptorUrl) {
  return readCredentials().then(credentials => {
    return new Promise((resolve, reject) => {
      request.post(
        {
          uri: `https://api.bitbucket.org/2.0/account/${credentials.bitbucket.username}/addons`,
          auth: asRequestAuth(credentials),
          json: true,
          body: { url: descriptorUrl }
        },
        (error, response, body) => {
          if (error) {
            reject(`Failed to install Bitbucket add-on ${error}`);
          } else if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(
              `Failed to install Bitbucket add-on ${
                response.statusCode
              } ${JSON.stringify(body)}`
            );
          } else {
            resolve();
          }
        }
      );
    });
  });
}

exports.deregister = function () {
  const self = this;

  return getRegisteredAddonId(self.descriptor.key).then(addonId => {
    return new Promise((resolve, reject) => {
      if (addonId) {
        resolve(deregisterAddon(addonId));
      } else {
        reject("No matching registered addon found.");
      }
    });
  });
};

let sigintSetup = false;

exports.register = function (isReregistration) {
  const self = this;

  if (isReregistration) {
    // deregister first
    return self.deregister().then(() => {
      self.register(false);
    });
  }

  // check if the add-on is already registered
  return getRegisteredAddonId(self.descriptor.key)
    .then(addonId => {
      if (addonId) {
        return new Promise((resolve, reject) => {
          return inquirer
            .prompt({
              type: "confirm",
              name: "deregister",
              message: `An add-on with key ${addonId} is already registered. Would you like to re-register it?`,
              default: false
            })
            .then(answer => {
              if (answer.deregister) {
                self.logger.info("Re-registering add-on.");
                resolve(deregisterAddon(addonId));
              } else {
                reject("Add-on with this key was already registered.");
              }
            });
        });
      }
    })
    .then(() => {
      const localUrl = urls.parse(self.config.localBaseUrl());
      localUrl.pathname = [localUrl.pathname, self.descriptorFilename].join("");
      const descriptorUrl = urls.format(localUrl);

      return registerAddon(descriptorUrl).then(() => {
        if (!sigintSetup) {
          // trap SIGINT and deregister add-on
          process.once("SIGINT", () => {
            console.log("\nCaught SIGINT, deregistering add-on.");
            function sigint() {
              process.kill(process.pid, "SIGINT");
            }
            self.deregister().then(
              () => {
                self.emit("addon_deregistered");
                sigint();
              },
              function () {
                self.logger.error.apply(self.logger, arguments);
                sigint();
              }
            );
          });
          sigintSetup = true;
        }
      });
    })
    .catch(error => {
      self.logger.error(`Failed to register add-on: ${error}`);
    });
};

exports.shouldRegister = function () {
  return /force-reg/.test(process.env.AC_OPTS) || this.settings.isMemoryStore();
};

exports.shouldDeregister = function () {
  return (
    /force-dereg/.test(process.env.AC_OPTS) || this.settings.isMemoryStore()
  );
};
