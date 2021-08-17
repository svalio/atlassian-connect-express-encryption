const app = require("express")();
const _ = require("lodash");

const ac = require("../index");
const logger = require("./logger");

describe("Descriptor", () => {
  let addon;
  const options = {
    config: {
      key: "my-test-app-key",
      name: "My Test App Name",
      description: "My test app description.",
      version: "1",
      vendorName: "My Company",
      vendorUrl: "http://example.com",
      permissions: ["create_oauth_link"],
      documentationUrl: "http://example.com",
      development: {
        appKey: "my-test-app-key"
      }
    }
  };

  describe("With bitbucket product", () => {
    beforeAll(() => {
      app.set("env", "development");
      options.config.product = "bitbucket";
      addon = ac(app, options, logger);
    });

    it("should not have unsupproted `apiMigrations` in the app descriptor", () => {
      const { apiMigrations } = addon.descriptor;
      expect(apiMigrations).toBeUndefined();
    });
  });

  describe("With default configuration", () => {
    beforeAll(() => {
      app.set("env", "development");
      addon = ac(app, options, logger);
    });

    it("should be parsed as an object", () => {
      expect(typeof addon.descriptor).toEqual("object");
    });

    it("should have variables replaced from the addon config", () => {
      const key = addon.descriptor.key;
      expect(typeof key).toEqual("string");
      expect(key).toEqual("my-test-app-key");
      const name = addon.descriptor.name;
      expect(typeof name).toEqual("string");
      expect(name).toEqual("My Test App Name");
      const description = addon.descriptor.description;
      expect(typeof description).toEqual("string");
      expect(description).toEqual("My test app description.");
      const version = addon.descriptor.version;
      expect(typeof version).toEqual("string");
      expect(version).toEqual("1");
      const vendorName = addon.descriptor.vendor.name;
      expect(typeof vendorName).toEqual("string");
      expect(vendorName).toEqual("My Company");
      const vendorUrl = addon.descriptor.vendor.url;
      expect(typeof vendorUrl).toEqual("string");
      expect(vendorUrl).toEqual("http://example.com");
    });

    it("should list webhooks", () => {
      let webhooks = addon.descriptor.modules.webhooks;
      expect(webhooks.length).toEqual(2);
      const enabled = webhooks[0];
      expect(enabled.event).toEqual("issue_created");
      expect(enabled.url).toEqual("/issueCreated");
      const testHook = webhooks[1];
      expect(testHook.event).toEqual("plugin_test_hook");
      expect(testHook.url).toEqual("/test-hook");
      webhooks = _.filter(addon.descriptor.modules.webhooks, {
        event: "issue_created"
      });
      expect(webhooks.length).toEqual(1);
    });
  });

  describe("With a configured descriptorTransformer", () => {
    const targetKey = "new-key";

    beforeAll(() => {
      app.set("env", "development");
      const opts = options;
      opts.config.descriptorTransformer = function (descriptor) {
        descriptor.key = targetKey;
        return descriptor;
      };
      addon = ac(app, opts, logger);
    });

    it("should process the descriptorTransformer when generating the descriptor", () => {
      expect(addon.descriptor.key).toEqual(targetKey);
    });
  });
});
