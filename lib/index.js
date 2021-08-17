const EventEmitter = require("events").EventEmitter;
const URI = require("urijs");
const urls = require("url");
const _ = require("lodash");
const fs = require("fs");
const util = require("util");
const jwt = require("atlassian-jwt");
const config = require("./internal/config");
const utils = require("./internal/utils");
const registration = require("./internal/registration");
const defLogger = require("./internal/logger");
const HostRequest = require("./internal/host-request");
const verifyInstallation = require("./middleware/verify-installation");
const authentication = require("./middleware/authentication");
const authorization = require("./middleware/authorization");
const token = require("./middleware/token");
const store = require("./store");

const DESCRIPTOR_FILENAME = "atlassian-connect.json";
const CONFIG_FILENAME = "config.json";

class Addon extends EventEmitter {
  constructor(
    app,
    opts,
    logger,
    {
      descriptorFilename = DESCRIPTOR_FILENAME,
      configFileName = CONFIG_FILENAME
    },
    callback
  ) {
    super();

    process.on("unhandledRejection", err => {
      logger.error("Unhandled error:", err.stack || err);
    });

    const self = this;
    self.app = app;
    Addon.logger = self.logger = logger;

    const configOpts = utils.loadJSON(configFileName);
    self.config = config(configOpts, app.get("env"), opts.config);
    Addon.settings = self.settings = store(logger, self.config.store());
    self.schema = self.settings.schema; // store-adapter-dependent
    self.descriptorFilename = descriptorFilename;
    self.descriptor = require("./internal/addon-descriptor")(self);
    self.key = self.descriptor.key;
    self.name = self.descriptor.name;
    self._jwt = jwt;

    try {
      _.extend(self, registration(self));
    } catch (e) {
      self.logger.info("Auto registration is not avaiable for this add-on.");
    }

    if (self.app.get("env") === "development") {
      // validate current descriptor on start
      if (self.config.validateDescriptor()) {
        self.validateDescriptor();
      }

      if (self.config.watch()) {
        self.logger.info(`Watching ${descriptorFilename} for changes`);
        const reregisterWatcher = function () {
          self.watcher && self.watcher.close(); // clean up existing watcher if present
          self.watcher = fs.watch(
            descriptorFilename,
            { persistent: false },
            event => {
              if (event === "change" || event === "rename") {
                self.logger.info(
                  `Re-registering due to ${descriptorFilename} change`
                );
                self.reloadDescriptor();
                self.register(true);

                if (self.config.validateDescriptor()) {
                  self.validateDescriptor();
                }
              }
              // re-register after each change, intellij's "safe write" feature can break file watches
              reregisterWatcher();
            }
          );
        };
        reregisterWatcher();
      }
    }

    // defer configuration of the plugin until the express app has been configured
    process.nextTick(() => {
      self._configure(callback);
    });
  }

  _configure(callback) {
    const self = this;

    if (!this.descriptor.baseUrl) {
      throw Error(
        `The "baseUrl" in ${self.descriptorFilename} must be present and non-empty.`
      );
    }

    const baseUrlInternal = new URI(this.descriptor.baseUrl);
    self.config.baseUrl = urls.parse(baseUrlInternal.toString());
    const descriptorUrl = baseUrlInternal
      .clone()
      .segment(self.descriptorFilename);

    self.app.get(descriptorUrl.path(), (req, res) => {
      res.charset = "UTF-8"; // avoid browsers and https://jsonformatter.curiousconcept.com/ saying "Invalid encoding, expecting UTF-8, UTF-16 or UTF-32."
      res.json(self.descriptor);
    });

    // auto-register routes for each webhook in the descriptor
    const modules = self.descriptor.modules;
    if (modules && modules.webhooks) {
      let webhooks = modules.webhooks;
      if (!Array.isArray(webhooks)) {
        webhooks = [webhooks];
      }
      webhooks.forEach(webhook => {
        if (!webhook.event) {
          self.logger.warn(
            `Webhook does not have event property: ${util.inspect(webhook)}`
          );
          return;
        }
        if (!webhook.url) {
          self.logger.warn(
            `Webhook does not have url property: ${util.inspect(webhook)}`
          );
          return;
        }
        const webhookUrl = baseUrlInternal.clone().segment(webhook.url);
        self.app.post(
          // mount path
          webhookUrl.path(),
          // auth middleware
          authentication.authenticateWebhook(self),
          // request handler
          (req, res) => {
            try {
              self.emit(webhook.event, webhook.event, req.body, req);
              res.status(204).end();
            } catch (ex) {
              res.status(500).send(_.escape(ex));
            }
          }
        );
      });
    }

    if (self.config.setupInstallRoute()) {
      const installUrl = baseUrlInternal.clone().segment("/installed");

      self.app.post(
        // installed POST handler
        installUrl.path(),
        // installed middleware (checks that the install event is complete and originates from an authorised host)
        verifyInstallation.verify(self),
        this.postInstallation()
      );
    }

    if (callback) {
      callback();
    }
  }

  verifyInstallation() {
    return verifyInstallation.verify(this);
  }

  postInstallation() {
    const self = this;

    return (req, res) => {
      const settings = req.body;
      self.settings.set("clientInfo", settings, settings.clientKey).then(
        data => {
          if (self.app.get("env") !== "production") {
            self.logger.info(
              `Saved tenant details for ${
                settings.clientKey
              } to database\n${util.inspect(data)}`
            );
          }
          self.emit("host_settings_saved", settings.clientKey, data);
          const { unexpectedInstallHook } = res.locals || {};
          if (unexpectedInstallHook) {
            res.setHeader("x-unexpected-symmetric-hook", "true");
          }
          res.status(204).send();
        },
        err => {
          self.emit("host_settings_not_saved", settings.clientKey, {
            err
          });
          res
            .status(500)
            .send(
              _.escape(
                `Could not lookup stored client data for ${settings.clientKey}: ${err}`
              )
            );
        }
      );
    };
  }

  // this middleware should be called by the add-on setup (see the template)
  middleware() {
    return require("./middleware")(this);
  }

  authenticate(skipQshVerification) {
    return authentication.authenticate(this, skipQshVerification);
  }

  authorizeConfluence(permissions) {
    return authorization.authorizeConfluence(this, permissions);
  }

  authorizeJira(permissions) {
    return authorization.authorizeJira(this, permissions);
  }

  // This middleware is for authenticating RS256 signed install hooks
  authenticateInstall() {
    return verifyInstallation.authenticateInstall(this);
  }

  // This middleware is separated from `authenticateInstall` only to support fallback authentication during grace period.
  // You should not use this to verify a custom uninstall hooks.
  authenticateAsymmetric() {
    return verifyInstallation.authenticateAsymmetric(this);
  }

  loadClientInfo(clientKey) {
    return Addon.settings.get("clientInfo", clientKey);
  }

  checkValidToken() {
    return token(this);
  }

  reloadDescriptor() {
    this.descriptor = require("./internal/addon-descriptor")(this);
  }

  /**
   * addon.httpClient(expressRequest)
   * addon.httpClient({clientKey, userAccountId})
   * (deprecated) addon.httpClient({clientKey, userKey})
   *
   * @param reqOrOpts either an expressRequest object or options
   * @returns HostClient a httpClient
   */
  httpClient(reqOrOpts) {
    const ctx = reqOrOpts.context;
    if (ctx) {
      return ctx.http;
    }

    if (!reqOrOpts.clientKey) {
      throw new Error("Http client options must specify clientKey");
    }

    return new HostRequest(this, reqOrOpts, reqOrOpts.clientKey);
  }
}

module.exports = function (app, opts, logger, fileNames, callback) {
  if (typeof fileNames === "function") {
    callback = fileNames;
    fileNames = {};
  }

  return new Addon(
    app,
    opts || {},
    logger || defLogger,
    fileNames || {},
    callback
  );
};

module.exports.store = {
  register: store.register
};

module.exports.DESCRIPTOR_FILENAME = DESCRIPTOR_FILENAME;
