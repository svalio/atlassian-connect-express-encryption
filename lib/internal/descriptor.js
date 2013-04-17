var fs = require("fs");
var parser = require("xml2json");
var _ = require("underscore");

var publicKey = fs.readFileSync("./public-key.pem");

function Descriptor(xml, model) {
  this.xml = xml;
  _(this).extend(toNode(model["atlassian-plugin"]));
}

var proto = Descriptor.prototype;

proto.toString = function () {
  return this.xml;
};

proto.webhooks = function (event) {
  var webhooks = this.get("webhook");
  if (event) {
    webhooks = webhooks.filter(function (wh) {
      return wh.get("event") === event;
    });
  }
  return webhooks;
};

Descriptor.load = function (appUrl) {
  var xmlTmpl = fs.readFileSync("./atlassian-plugin.xml").toString();
  var xml = xmlTmpl
    .replace("@public-key@", publicKey)
    .replace("@app-url@", appUrl);
  var model = JSON.parse(parser.toJson(xml));
  return new Descriptor(xml, model);
};

function toNode(node) {
  return {
    node: node,
    text: function () {
      return node["$t"];
    },
    get: function (name) {
      var child = node[name];
      if (!_.isArray(child) && typeof child === "object") {
        child = [child];
      }
      if (_.isArray(child)) {
        child = child.map(toNode);
      }
      return child;
    }
  };
}

module.exports = Descriptor;
