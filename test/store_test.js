const helper = require("./test_helper");
const should = require("should");
const http = require("http");
const express = require("express");
const bodyParser = require("body-parser");
const request = require("request");
const RSVP = require("rsvp");
const Sequelize = require("sequelize");
const logger = require("./logger");
const sinon = require("sinon");
const MongodbMemoryServer = require("mongodb-memory-server").default;

const stores = ["sequelize", "mongodb"];

stores.forEach(function(store) {
  const app = express();
  const ac = require("../index");
  let addon = {};

  describe("Store " + store, function() {
    let server = {},
      dbServer = null;
    // eslint-disable-next-line mocha/no-setup-in-describe
    const oldACOpts = process.env.AC_OPTS;

    let storeGetSpy;
    let storeSetSpy;
    let storeDelSpy;

    before(function(done) {
      const self = this;
      this.sandbox = sinon.createSandbox();
      process.env.AC_OPTS = "no-auth";
      app.set("env", "development");
      app.use(bodyParser.urlencoded({ extended: false }));
      app.use(bodyParser.json());

      app.get("/confluence/rest/plugins/1.0/", function(req, res) {
        res.setHeader("upm-token", "123");
        res.json({ plugins: [] });
        res.status(200).end();
      });

      // Post request to UPM installer
      app.post("/confluence/rest/plugins/1.0/", function(req, res) {
        request({
          url: helper.addonBaseUrl + "/installed",
          method: "POST",
          json: helper.installedPayload
        });
        res.status(200).end();
      });

      ac.store.register("teststore", function(logger, opts) {
        const Store = require("../lib/store/" + store)();
        storeGetSpy = self.sandbox.spy(Store.prototype, "get");
        storeSetSpy = self.sandbox.spy(Store.prototype, "set");
        storeDelSpy = self.sandbox.spy(Store.prototype, "del");
        return new Store(logger, opts);
      });

      let storeOptsPromise;
      switch (store) {
        case "sequelize":
          storeOptsPromise = RSVP.resolve({
            adapter: "teststore",
            type: "memory"
          });
          break;
        case "mongodb":
          // Increase timeout in case the download needs to be run.
          this.timeout(60000);
          // Prepare an in-memory database for this test
          dbServer = new MongodbMemoryServer({
            // debug: true // this is fairly verbose
            binary: {
              version: "3.6.9"
            }
          });
          storeOptsPromise = dbServer
            .getConnectionString()
            .then(function(connectionString) {
              return {
                adapter: "teststore",
                url: connectionString
              };
            });
          break;
      }
      storeOptsPromise.then(function(storeOpts) {
        addon = ac(
          app,
          {
            config: {
              development: {
                store: storeOpts,
                hosts: [helper.productBaseUrl]
              }
            }
          },
          logger
        );

        server = http.createServer(app).listen(helper.addonPort, function() {
          addon.register().then(done);
        });
      });
    });

    after(function(done) {
      this.sandbox.restore();
      process.env.AC_OPTS = oldACOpts;
      server.close();
      if (dbServer) {
        dbServer.stop();
      }
      done();
    });

    it("should store client info", function(done) {
      addon.on("host_settings_saved", function() {
        addon.settings
          .get("clientInfo", helper.installedPayload.clientKey)
          .then(
            function(settings) {
              settings.clientKey.should.eql(helper.installedPayload.clientKey);
              settings.sharedSecret.should.eql(
                helper.installedPayload.sharedSecret
              );
              done();
            },
            function(err) {
              should.fail(err.toString());
            }
          );
      });
    });

    it("should return a list of clientInfo objects", function(done) {
      addon.settings.getAllClientInfos().then(
        function(initialClientInfos) {
          return addon.settings
            .set("clientInfo", { correctPayload: true }, "fake")
            .then(function() {
              return addon.settings
                .getAllClientInfos()
                .then(function(clientInfos) {
                  clientInfos.should.have.length(initialClientInfos.length + 1);
                  const latestClientInfo = clientInfos[clientInfos.length - 1];
                  const correctPayload = latestClientInfo["correctPayload"];
                  correctPayload.should.be.true();
                  done();
                });
            });
        },
        function(err) {
          should.fail(err.toString());
        }
      );
    });

    it("should allow storing arbitrary key/values as a JSON string", function(done) {
      const value = '{"someKey": "someValue"}';
      addon.settings
        .set("arbitrarySetting", value, helper.installedPayload.clientKey)
        .then(
          function(setting) {
            setting.should.eql({ someKey: "someValue" });
            done();
          },
          function(err) {
            should.fail(err.toString());
          }
        );
    });

    it("should allow storing arbitrary key/values as object", function(done) {
      addon.settings
        .set(
          "arbitrarySetting2",
          { data: 1 },
          helper.installedPayload.clientKey
        )
        .then(
          function(setting) {
            setting.should.eql({ data: 1 });
            done();
          },
          function(err) {
            should.fail(err.toString());
          }
        );
    });

    it("should allow storing arbitrary key/values", function(done) {
      const value = "barf";
      addon.settings
        .set("arbitrarySetting3", value, helper.installedPayload.clientKey)
        .then(
          function(setting) {
            setting.should.eql("barf");
            done();
          },
          function(err) {
            should.fail(err.toString());
          }
        );
    });

    switch (store) {
      case "sequelize": {
        it("should allow storage of arbitrary models [" + store + "]", function(
          done
        ) {
          const User = addon.schema.define("User", {
            id: {
              type: Sequelize.INTEGER,
              autoIncrement: true,
              primaryKey: true
            },
            name: { type: Sequelize.STRING },
            email: { type: Sequelize.STRING },
            bio: { type: Sequelize.JSON }
          });

          addon.schema.sync().then(
            function() {
              User.create({
                name: "Rich",
                email: "rich@example.com",
                bio: {
                  description: "Male 6' tall",
                  favoriteColors: ["blue", "green"]
                }
              }).then(function(model) {
                model.name.should.eql("Rich");
                User.findAll({ name: "Rich" }).then(function(user) {
                  user[0].name.should.eql(model.name);
                  done();
                });
              });
            },
            function(err) {
              should.fail(err.toString());
            }
          );
        });

        it("should work with a custom store", function(done) {
          const promises = [
            addon.settings.set(
              "custom key",
              { customKey: "custom value" },
              helper.installedPayload.clientKey
            ),
            addon.settings.get("custom key", helper.installedPayload.clientKey),
            addon.settings.del("custom key", helper.installedPayload.clientKey)
          ];
          RSVP.all(promises)
            .then(function() {
              storeSetSpy.callCount.should.be.above(0);
              storeGetSpy.callCount.should.be.above(0);
              storeDelSpy.callCount.should.be.above(0);
              done();
            })
            .catch(function(err) {
              should.fail(err);
            });
        });
        break;
      }
      case "mongodb": {
        it("should not allow storing a non-string key", function(done) {
          const value = "barf";
          addon.settings
            .set(42, value, helper.installedPayload.clientKey)
            .then(function() {
              done(
                new Error("Expected non-string key storage to be disallowed")
              );
            })
            .catch(function() {
              done();
            });
        });
        it("should not allow deleting a non-string key", function(done) {
          addon.settings
            .del(42, helper.installedPayload.clientKey)
            .then(function() {
              done(
                new Error("Expected non-string key deletion to be disallowed")
              );
            })
            .catch(function() {
              done();
            });
        });
        it("should not allow storing a non-string clientKey", function(done) {
          const value = "barf";
          addon.settings
            .set("additionalSetting4", value, 42)
            .then(function() {
              done(
                new Error(
                  "Expected non-string clientKey storage to be disallowed"
                )
              );
            })
            .catch(function() {
              done();
            });
        });
        it("should not allow deleting a non-string clientKey", function(done) {
          addon.settings
            .del("additionalSetting4", 42)
            .then(function() {
              done(
                new Error(
                  "Expected non-string clientKey deletion to be disallowed"
                )
              );
            })
            .catch(function() {
              done();
            });
        });
        it("should allow an empty string key and value", function(done) {
          addon.settings
            .set("", "", helper.installedPayload.clientKey)
            .then(function(setting) {
              should(setting).equal("");
              return addon.settings.get("", helper.installedPayload.clientKey);
            })
            .then(function(setting) {
              should(setting).equal("");
              done();
            })
            .catch(done);
        });
        break;
      }
    }
  });
});
