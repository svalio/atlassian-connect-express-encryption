const _ = require("lodash");
const os = require("os");
const utils = require("./utils");
const URI = require("urijs");

const env = process.env;

const PRODUCTS = {
  JIRA: {
    id: "jira"
  },
  CONFLUENCE: {
    id: "confluence"
  },
  BITBUCKET: {
    id: "bitbucket"
  }
};

const isProductChecker = function (productKey) {
  return function () {
    return this.id === productKey;
  };
};

_.each(PRODUCTS, p => {
  p.isJIRA = isProductChecker("jira").call(p);
  p.isConfluence = isProductChecker("confluence").call(p);
  p.isBitbucket = isProductChecker("bitbucket").call(p);
});

module.exports = function (config, mode, overrides) {
  config = _.merge(config, overrides);
  const globalValues = utils.replaceAll(config, env);
  const modeValues = utils.replaceAll(config[mode] || config.development, env);

  function get(values, key, envKey, vars) {
    let value = env[envKey] || values[key] || defaults[key];
    if (vars && _.isString(value)) {
      value = utils.replaceStr(value, vars);
    }
    return value;
  }

  function wrap(values) {
    return _.fromPairs(
      Object.keys(values).map(k => {
        return [
          k,
          function () {
            return values[k];
          }
        ];
      })
    );
  }

  function includeCredentialsHosts() {
    const creds = utils.loadJSON("credentials.json");
    const host_obj = creds.hosts;
    if (!host_obj) {
      return [];
    }
    const hosts = Object.keys(host_obj);

    const urls = [];
    for (const i in hosts) {
      const host = hosts[i];
      const url = new URI(host);
      url
        .protocol("https")
        .username(host_obj[host].username)
        .password(host_obj[host].password);

      if (
        typeof host_obj[host].product === "string" &&
        host_obj[host].product.toLowerCase() === "confluence"
      ) {
        url.segment("wiki");
      }

      urls.push(url.toString());
    }
    return urls;
  }

  return _.extend({}, wrap(globalValues), wrap(modeValues), {
    // override simple accessors with more intelligent ones, and add others
    expressErrorHandling() {
      return modeValues.expressErrorHandling === true
        ? true
        : defaults.expressErrorHandling;
    },

    errorTemplate() {
      return modeValues.errorTemplate === true ? true : defaults.errorTemplate;
    },

    setupInstallRoute() {
      return modeValues.setupInstallRoute === false
        ? false
        : defaults.setupInstallRoute;
    },

    watch() {
      return modeValues.watch === false ? false : defaults.watch;
    },

    validateDescriptor() {
      return modeValues.validateDescriptor === true
        ? true
        : defaults.validateDescriptor;
    },

    port() {
      return get(modeValues, "port", "PORT");
    },

    localBaseUrl() {
      return get(modeValues, "localBaseUrl", "AC_LOCAL_BASE_URL", {
        port: this.port()
      });
    },

    allowedBaseUrls() {
      let baseUrls =
        get(modeValues, "allowedBaseUrls", "AC_ALLOWED_BASE_URLS") || [];
      if (_.isString(baseUrls)) {
        baseUrls = baseUrls.split(",").map(aud => aud.trim());
      }
      return _.compact([this.localBaseUrl(), ...baseUrls]);
    },

    environment() {
      return get(modeValues, "environment", "NODE_ENV");
    },

    appKey() {
      return get(modeValues, "appKey", "AC_APP_KEY");
    },

    store() {
      return modeValues.store || defaults.store;
    },

    signedInstall() {
      // `signedInstall()` returns 'disable' by default.
      // This is used to support configurations in < v7.3.0 versions
      // Setting this to "force" will not fallback to a legacy install callback authentication
      const signedInstall = globalValues["signed-install"];
      return _.includes(["enable", "disable", "force"], signedInstall)
        ? signedInstall
        : "disable";
    },

    product() {
      const configProduct =
        env.AC_PRODUCT ||
        modeValues.product ||
        globalValues.product ||
        defaults.product;
      const product = _.find(PRODUCTS, { id: configProduct });

      if (!product) {
        throw new Error(
          `Product ${configProduct} not supported. Valid values: [${_.map(
            PRODUCTS,
            "id"
          ).join(", ")}]`
        );
      }
      return product;
    },

    hosts() {
      return get(modeValues, "hosts").concat(includeCredentialsHosts());
    },

    jwt() {
      return get(modeValues, "jwt");
    },

    // Returns the maximum age of a token in milliseconds.
    // The configuration value represents seconds.
    maxTokenAge() {
      return get(modeValues, "maxTokenAge") * 1000;
    },

    whitelist() {
      let list = get(modeValues, "whitelist", "AC_HOST_WHITELIST");
      if (!list) {
        if (mode === "production") {
          const product = this.product();
          if (product.isJIRA || product.isConfluence) {
            list = "*.atlassian.net";
          }
        } else {
          list = "";
        }
      }
      if (_.isString(list)) {
        list = list.split(",").map(glob => {
          return glob.trim();
        });
      }
      return list;
    },

    whitelistRegexp() {
      return this.whitelist().map(glob => {
        return glob !== ""
          ? new RegExp(
              `^${glob.replace(/\./g, "\\.").replace(/\*/g, "[^.]*")}$`
            )
          : new RegExp(".*");
      });
    },

    userAgent() {
      return (
        modeValues.userAgent || globalValues.userAgent || defaults.userAgent
      );
    }
  });
};

const defaults = {
  expressErrorHandling: false,
  errorTemplate: false,
  setupInstallRoute: true,
  watch: true,
  validateDescriptor: false,
  port: 3000,
  localBaseUrl: `http://${os.hostname()}:$port`,
  environment: "development",
  store: {
    adapter: "sequelize",
    type: "memory"
  },
  jwt: {
    validityInMinutes: 3
  },
  product: "jira", // Can be: 'jira', 'confluence', 'bitbucket'
  hosts: [],
  maxTokenAge: 15 * 60,
  userAgent: `atlassian-connect-express/${utils.packageVersion()}`
};
