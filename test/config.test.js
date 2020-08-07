const config = require("../lib/internal/config");

describe("Configuration", () => {
  const createConfig = function (baseConfig, mode, overrides) {
    if (arguments.length === 0) {
      baseConfig = {};
      mode = "development";
      overrides = {};
    } else if (arguments.length === 1) {
      overrides = baseConfig;
      mode = "development";
      baseConfig = {};
    } else if (arguments.length === 2) {
      overrides = mode;
      mode = "development";
    }
    const opts = {};
    opts[mode] = overrides;
    return config(baseConfig, mode, opts);
  };

  it("should allow you to disable re-registration on atlassian-connect.json change", () => {
    const config = createConfig({
      watch: false
    });
    expect(config.watch()).toBe(false);
  });

  it("should allow prefer env values over globals", () => {
    const config = createConfig(
      {
        customShadowed: "global"
      },
      {
        customShadowed: "env"
      }
    );
    expect(config.customShadowed()).toBe("env");
  });

  it("should allow access to custom global values", () => {
    const config = createConfig(
      {
        customGlobal: "global"
      },
      {}
    );
    expect(config.customGlobal()).toBe("global");
  });

  it("should allow access to custom env-specific values", () => {
    const config = createConfig({
      customEnv: "bar"
    });
    expect(config.customEnv()).toBe("bar");
  });

  describe("Product", () => {
    it("should default to jira", () => {
      const config = createConfig();
      expect(config.product().id).toBe("jira");
    });

    it("should read type jira from config", () => {
      const config = createConfig({
        product: "jira"
      });
      expect(config.product().id).toBe("jira");
      expect(config.product().isJIRA).toBe(true);
      expect(config.product().isConfluence).toBe(false);
      expect(config.product().isBitbucket).toBe(false);
    });

    it("should read type confluence from config", () => {
      const config = createConfig({
        product: "confluence"
      });
      expect(config.product().id).toBe("confluence");
      expect(config.product().isJIRA).toBe(false);
      expect(config.product().isConfluence).toBe(true);
      expect(config.product().isBitbucket).toBe(false);
    });

    it("should read type confluence from global config", () => {
      const config = createConfig(
        {
          product: "confluence"
        },
        "development",
        {
          notProduct: "boring"
        }
      );
      expect(config.product().id).toBe("confluence");
      expect(config.product().isJIRA).toBe(false);
      expect(config.product().isConfluence).toBe(true);
      expect(config.product().isBitbucket).toBe(false);
    });

    it("should read type bitbucket from config", () => {
      const config = createConfig({
        product: "bitbucket"
      });
      expect(config.product().id).toBe("bitbucket");
      expect(config.product().isJIRA).toBe(false);
      expect(config.product().isConfluence).toBe(false);
      expect(config.product().isBitbucket).toBe(true);
    });

    it("should not allow type hipchat from config", () => {
      const config = createConfig({
        product: "hipchat"
      });
      expect(config.product).toThrowError();
    });

    it("should not allow unknown type from config", () => {
      const config = createConfig({
        product: "chatty"
      });
      expect(config.product).toThrowError();
    });
  });

  describe("Whitelist", () => {
    it("should accept single-segment hostnames in dev mode", () => {
      expect(matches(createConfig(), "localhost")).toBe(true);
    });

    it("should accept multi-segment hostnames in dev mode", () => {
      expect(matches(createConfig(), "machine.dyn.syd.atlassian.com")).toBe(
        true
      );
    });

    it("should accept fully qualified domain names", () => {
      const cfg = createWhiteListConfig("*.atlassian.net");
      expect(matches(cfg, "connect.atlassian.net")).toBe(true);
    });

    it("should not accept partial domain name matches", () => {
      const cfg = createWhiteListConfig("*.jira.com");
      expect(matches(cfg, "test.jira.com.hh.ht")).toBe(false);
    });

    it("should not accept subdomains", () => {
      const cfg = createWhiteListConfig("*.jira.com");
      expect(matches(cfg, "foo.test.jira.com")).toBe(false);
    });

    it("should accept multiple comma separated patterns", () => {
      const cfg = createWhiteListConfig("*.jira.com, *.atlassian.net");
      expect(matches(cfg, "connect.jira.com")).toBe(true);
      expect(matches(cfg, "connect.atlassian.net")).toBe(true);
      expect(matches(cfg, "connect.jira-dev.com")).toBe(false);
    });

    it("should default to ['*.atlassian.net'] in production", () => {
      const defaultProdCfg = createConfig({}, "production", {});
      expect(defaultProdCfg.whitelist()).toEqual(["*.atlassian.net"]);
    });

    function matches(cfg, host) {
      return cfg.whitelistRegexp().some(re => {
        return re.test(host);
      });
    }

    function createWhiteListConfig(domain) {
      return createConfig({ whitelist: domain });
    }
  });

  describe("userAgent", () => {
    it("should default to package version", () => {
      const version = require("../package.json").version;
      const defaultConfig = createConfig({}, "development", {});
      expect(defaultConfig.userAgent()).toBe(
        `atlassian-connect-express/${version}`
      );
    });

    it("should allow you to override it globally", () => {
      const userAgent = "my-cool-app";
      const defaultConfig = createConfig(
        {
          userAgent
        },
        "development",
        {}
      );

      expect(defaultConfig.userAgent()).toBe(userAgent);
    });

    it("should allow you to override it in production", () => {
      const defaultConfig = createConfig(
        {
          userAgent: "dev-my-cool-app"
        },
        "production",
        {
          userAgent: "prod-my-cool-app"
        }
      );

      expect(defaultConfig.userAgent()).toBe("prod-my-cool-app");
    });
  });
});
