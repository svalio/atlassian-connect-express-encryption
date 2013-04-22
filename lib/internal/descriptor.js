var fs = require("fs");
var parser = require("xml2json");
var _ = require("underscore");

function Descriptor(xml, model) {
  this.xml = xml;
  _(this).extend(toNode(model["atlassian-plugin"]));
}

var proto = Descriptor.prototype;

proto.toString = function () {
  return this.xml;
};

proto.documentationUrl = function () {
  var params = this.get("plugin-info")[0].get("param");
  var docParam = _.find(params, function (param) {
    return param.get("name") === "documentation.url";
  });
  return docParam && docParam.text();
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

Descriptor.load = function (config) {
  var xmlTmpl = fs.readFileSync("./atlassian-plugin.xml").toString();
  var xml = xmlTmpl.replace(/@(\w+)@/g, function ($0, $1) {
    return config[$1] ? config[$1]() : $0;
  });
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
