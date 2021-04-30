const request = require("request");
const URI = require("urijs");
const _ = require("lodash");
const errmsg = require("../errors").errmsg;
const validator = require("atlassian-connect-validator");
const util = require("util");

function requireNgrok() {
  return require("../require-optional").requireOptional("ngrok");
}

function createTunnel(addon) {
  const hasRemoteHosts = _.some(addon.config.hosts(), host => {
    return !/localhost/.test(host);
  });
  if (process.env.AC_LOCAL_BASE_URL || !hasRemoteHosts) {
    return Promise.resolve();
  }

  return requireNgrok()
    .then(ngrok => {
      const ngrokPromise = ngrok.connect({
        proto: "http",
        addr: addon.config.port()
      });
      if (!ngrokPromise) {
        return Promise.reject("You must update ngrok to >= 3.0");
      }
      return ngrokPromise;
    })
    .then(url => {
      const ltu = new URI(url);
      const lbu = new URI(addon.config.localBaseUrl());
      lbu.protocol(ltu.protocol());
      lbu.host(ltu.host());
      process.env.AC_LOCAL_BASE_URL = lbu.toString();
      addon.logger.info(`Local tunnel established at ${lbu.toString()}`);
      addon.logger.info("Check http://127.0.0.1:4040 for tunnel status");
      addon.emit("localtunnel_started");
      addon.reloadDescriptor();
    })
    .catch(err => {
      addon.logger.error("Failed to establish local tunnel");
      if (err.code === "MODULE_NOT_FOUND") {
        addon.logger.error(
          "Make sure that ngrok is installed: npm install --save-dev ngrok"
        );
      }
      throw err && err.stack ? err : new Error(err);
    });
}

exports.shouldRegister = function () {
  return /force-reg/.test(process.env.AC_OPTS) || this.settings.isMemoryStore();
};

exports.shouldDeregister = function () {
  return (
    /force-dereg/.test(process.env.AC_OPTS) ||
    this.settings.isMemoryStore() ||
    this.config.environment() === "development"
  );
};

exports.register = function (isReregistration) {
  const self = this;
  return new Promise((resolve, reject) => {
    if (/no-reg/.test(process.env.AC_OPTS)) {
      self.logger.warn("Auto-registration disabled with AC_OPTS=no-reg");
      return resolve();
    }
    self._registrations = {};
    const hostRegUrls = self.config.hosts();
    createTunnel(self).then(
      () => {
        if (hostRegUrls && hostRegUrls.length > 0) {
          if (!isReregistration) {
            self.logger.info("Registering add-on...");

            const handleKillSignal = function (signal) {
              process.once(signal, () => {
                console.log(`\nReceived signal ${signal}`);

                function forwardSignal() {
                  process.kill(process.pid, signal);
                }

                self.deregister().then(
                  () => {
                    self.emit("addon_deregistered");
                    forwardSignal();
                  },
                  function () {
                    self.logger.error.apply(self.logger, arguments);
                    forwardSignal();
                  }
                );
              });
            };

            handleKillSignal("SIGTERM");
            handleKillSignal("SIGINT");
            // nodemon sends the SIGUSR2 signal
            // see https://github.com/remy/nodemon#controlling-shutdown-of-your-script
            handleKillSignal("SIGUSR2");
          }
          const forceRegistration = self.shouldRegister() || isReregistration;
          Promise.all(
            hostRegUrls.map(_.bind(register, self, forceRegistration))
          ).then(() => {
            const count = _.keys(self._registrations).length;
            if (count === 0) {
              self.logger.warn(
                "Add-on not registered; no compatible hosts detected"
              );
            }
            resolve();
            self.emit("addon_registered");
          });
        }
      },
      err => {
        console.log(`err = ${err}`);
        self.logger.error(errmsg(err));
        reject(err);
      }
    );
  });
};

exports.deregister = function () {
  const self = this;
  const hostRegUrls = _.keys(self._registrations);
  let promise;

  if (hostRegUrls.length > 0 && self.shouldDeregister()) {
    self.logger.info("Deregistering add-on...");
    promise = Promise.all(hostRegUrls.map(_.bind(deregister, self)));
  } else {
    promise = Promise.resolve();
  }
  promise.finally(() => {
    requireNgrok().then(ngrok => {
      ngrok.kill();
    });
  });
  return promise;
};

exports.validateDescriptor = function () {
  const self = this;

  return new Promise((resolve, reject) => {
    self.logger.info(
      "Trying to validate the app descriptor. The app will still continue to run even on validation errors and warnings. This is just to inform you of potential mistakes in descriptor"
    );

    const product = self.config.product();
    const productName = product.isJIRA ? "jira" : "confluence";

    const descriptor = self.descriptor;

    getGlobalProductSchema(productName).then(
      schema => {
        const results = [];
        validator.validateDescriptor(descriptor, schema, (errors, warnings) => {
          if (errors) {
            results.push(
              getValidationFailCause("error", "Validation errors", errors)
            );
          }

          if (warnings) {
            results.push(
              getValidationFailCause(
                "warning",
                "Unexpected attributes: The descriptor is valid, but double-check for typos and elements in the wrong place",
                warnings
              )
            );
          }

          if (results.length > 0) {
            self.logger.info(
              `Error validating app descriptor: [${JSON.stringify(
                results,
                null,
                2
              )}] . Please check and resolve the problem/s. ` +
                `The app will still continue to run but there might be problems installing this`
            );
          } else {
            self.logger.info("App descriptor is valid");
          }

          resolve(results);
        });
      },
      error => {
        return reject(error);
      }
    );
  });
};

let productSchema = {};
function getGlobalProductSchema(productName) {
  const self = this;
  return new Promise((resolve, reject) => {
    if (!_.isEmpty(productSchema)) {
      return resolve(productSchema);
    }

    const docsSchemaUrlFormat =
      process.env.SCHEMA_HOST ||
      "https://developer.atlassian.com/static/connect/docs/latest/schema/%s-global-schema.json";
    const url = util.format(docsSchemaUrlFormat, productName);

    request.get(
      {
        url,
        json: true
      },
      (error, response, body) => {
        const statusCode = !!error || !response ? 500 : response.statusCode;
        if (statusCode < 200 || statusCode > 299) {
          self.logger.error(
            `Could not download schema from ${url} : ${error || statusCode}`
          );
          return reject(error);
        } else {
          productSchema = body;
          resolve(productSchema);
        }
      }
    );
  });
}

function getValidationFailCause(type, message, cause) {
  const validationResults = [];

  cause.forEach(result =>
    validationResults.push(
      _.pick(result, ["module", "value", "validValues", "description"])
    )
  );

  return {
    type,
    message,
    validationResults
  };
}

function register(forceRegistration, hostRegUrl) {
  const self = this;

  const descriptorUrl = new URI(self.config.localBaseUrl())
    .segment(self.descriptorFilename)
    .toString();
  return new Promise(resolve => {
    function done(maybeResult) {
      const hostBaseUrl = stripCredentials(hostRegUrl);
      self.logger.info(`Registered with host at ${hostBaseUrl}`);
      self._registrations[hostRegUrl] = true;
      if (maybeResult) {
        self.logger.info(maybeResult);
      }
      resolve();
    }

    function fail(args) {
      self.logger.warn(
        registrationError("register", hostRegUrl, args[0], args[1])
      );
      resolve(); // reject will cause Promise error handler in index.js to blow up
      // resolve is fine since it will not be adding the client key and not count this as an install
    }

    registerUpm(
      hostRegUrl,
      descriptorUrl,
      self.descriptor.key,
      forceRegistration
    ).then(done, fail);
  });
}

function registerUpm(hostRegUrl, descriptorUrl, pluginKey, forceRegistration) {
  const reqObject = getUrlRequestObject(hostRegUrl, "/rest/plugins/1.0/");
  reqObject.jar = false;
  return new Promise((resolve, reject) => {
    request.get(reqObject, (err, res, body) => {
      function doReg() {
        const upmToken = res.headers["upm-token"];
        const reqObject = getUrlRequestObject(
          hostRegUrl,
          "/rest/plugins/1.0/",
          {
            token: upmToken
          }
        );
        reqObject.headers = {
          "content-type": "application/vnd.atl.plugins.remote.install+json"
        };
        reqObject.body = JSON.stringify({ pluginUri: descriptorUrl });
        reqObject.jar = false;
        request.post(reqObject, (err, res) => {
          if (err || (res && res.statusCode !== 202)) {
            return reject([err, res]);
          }
          const body = JSON.parse(res.body);
          waitForRegistrationResult(hostRegUrl, body).then(resolve, reject);
        });
      }
      if (err || (res && (res.statusCode < 200 || res.statusCode > 299))) {
        return reject([err, res]);
      }
      if (forceRegistration) {
        doReg();
      } else {
        body = JSON.parse(body);
        if (body && body.plugins) {
          let registered = false;
          body.plugins.forEach(plugin => {
            if (plugin.key === pluginKey) {
              resolve(
                `Add-on ${pluginKey} is already installed on ${stripCredentials(
                  hostRegUrl
                )}`
              );
              registered = true;
            }
          });
          if (!registered) {
            doReg();
          }
        }
      }
    });
  });
}

function waitForRegistrationResult(hostRegUrl, body) {
  const startTime = Date.now();
  const timeout = 30000; // 30 Second Timeout

  const reqObject = getUrlRequestObject(hostRegUrl, body.links.self);
  const callForRegistrationResult = function (lastBody) {
    const waitTime = lastBody.pingAfter || 200;
    return new Promise((resolve, reject) => {
      if (Date.now() - startTime > timeout) {
        reject(["Add-on installation timed out"]);
        return;
      }
      setTimeout(() => {
        request.get(reqObject, (err, res) => {
          if (err || (res && (res.statusCode < 200 || res.statusCode > 299))) {
            return reject([err, res]);
          }
          const results = JSON.parse(res.body);
          // UPM installed payload changes on successful install
          if (results.status && results.status.done) {
            // if results.status.done is true, then the build has failed as the payload of a
            // successful install does not contain the status object
            reject([results.status.errorMessage, res]);
          } else if (results.key) {
            // Key will only exist if the install succeeds
            let returnString = "";
            if (!results.enabled) {
              // If the add-on was disabled before being installed, it will go back to being disabled
              returnString = `Add-on is disabled on ${stripCredentials(
                hostRegUrl
              )}. Enable manually via upm`;
            }
            resolve(returnString);
          } else {
            // Still waiting on the finished event. Kinda hoping that this doesnt cause infinite looping if the payload changes :/
            callForRegistrationResult(results).then(resolve, reject);
          }
        });
      }, waitTime);
    });
  };
  return callForRegistrationResult(body);
}

function deregister(hostRegUrl) {
  const self = this;
  return new Promise(resolve => {
    function done() {
      const hostBaseUrl = stripCredentials(hostRegUrl);
      self.logger.info(`Unregistered on host ${hostBaseUrl}`);
      delete self._registrations[hostRegUrl];
      resolve();
    }

    function fail(args) {
      self.logger.warn(
        registrationError("deregister", hostRegUrl, args[0], args[1])
      );
      resolve();
    }

    if (self._registrations[hostRegUrl]) {
      deregisterUpm(self, hostRegUrl).then(done, fail);
    } else {
      resolve();
    }
  });
}

function deregisterUpm(self, hostRegUrl) {
  return new Promise((resolve, reject) => {
    const reqObject = getUrlRequestObject(
      hostRegUrl,
      `/rest/plugins/1.0/${self.key}-key`
    );
    reqObject.jar = false;
    request.del(reqObject, (err, res) => {
      if (err || (res && (res.statusCode < 200 || res.statusCode > 299))) {
        return reject([err, res]);
      }
      resolve();
    });
  });
}

function registrationError(action, hostUrl, err, res) {
  const hostBaseUrl = stripCredentials(hostUrl);
  const args = [`Failed to ${action} with host ${hostBaseUrl}`];
  if (res && res.statusCode) {
    args[0] = `${args[0]} (${res.statusCode})`;
  }
  if (err) {
    if (typeof err === "string") {
      args.push(err);
    } else {
      args.push(errmsg(err));
    }
  }
  if (res && res.body && !/^\s*<[^h]*html[^>]*>/i.test(res.body)) {
    args.push(res.body);
  }
  return args.join("\n");
}

function stripCredentials(url) {
  url = new URI(url);
  url.username("");
  url.password("");
  return url.toString();
}

function getUrlRequestObject(hostRegUrl, path, queryParams) {
  const uri = URI(hostRegUrl);
  const username = uri.username();
  const password = uri.password();
  uri.username("");
  uri.password("");
  // Remove any trailing slash from the uri
  // and any double product context from the path
  uri.pathname(
    uri.pathname().replace(/\/$/, "") +
      path.substring(path.indexOf("/rest/plugins/1.0"))
  );
  if (queryParams) {
    uri.query(queryParams);
  }
  return {
    uri: uri.toString(),
    auth: {
      user: username,
      pass: password
    }
  };
}
