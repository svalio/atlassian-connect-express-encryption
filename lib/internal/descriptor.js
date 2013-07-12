var fs = require('fs');
var parser = require('xml2json');
var _ = require('underscore');
var jsonpath = require('JSONPath').eval;

var ATLASSIAN_PLUGIN_XML = './atlassian-plugin.xml';

function Descriptor(xml, model) {
  this.xml = xml;
  _(this).extend(toNode(model['atlassian-plugin']));
}

var proto = Descriptor.prototype;

proto.toString = function () {
  return this.xml;
};

proto.key = function () {
  return this.select('$.key')[0];
};

proto.name = function () {
  return this.select('$.name')[0];
};

proto.pluginInfo = function () {
  return this.select('$.plugin-info')[0];
};

proto.description = function () {
  return this.select('$.plugin-info.description')[0];
};

proto.version = function () {
  return this.select('$.plugin-info.version')[0];
};

proto.vendor = function () {
  return this.select('$.plugin-info.vendor')[0];
};

proto.vendorName = function () {
  return this.select('$.plugin-info.vendor.name')[0];
};

proto.vendorUrl = function () {
  return this.select('$.plugin-info.vendor.url')[0];
};

proto.permissions = function () {
  return this.select('$.plugin-info.permissions.permission');
};

function pluginInfoParam(node, name) {
  return node.select('$.plugin-info.param[?(@.name==\'' + name + '\')].$t')[0];
}

proto.documentationUrl = function () {
  return pluginInfoParam(this, 'documentation.url');
};

proto.configureUrl = function () {
  return pluginInfoParam(this, 'configure.url');
};

proto.webhooks = function (event) {
  var webhooks = this.get('webhook');
  if (event) {
    webhooks = webhooks.filter(function (wh) {
      return wh.get('event') === event;
    });
  }
  return webhooks;
};

Descriptor.load = function (plugin) {
  var config = plugin.config;
  var xmlTmpl = fs.readFileSync(ATLASSIAN_PLUGIN_XML).toString();
  // make _ templates feel like hbs while supporting our getter-style config object
  xmlTmpl = xmlTmpl.replace(/(?:@|\{\{)([\w#\/ ]+)(?:@|\}\})(?:\n)?/g, function ($0, $1) {
    if ($1.indexOf('#each ') === 0) {
      $1 = $1.slice(6).trim();
      return '<%__c[\'' + $1 + '\']&&__c[\'' + $1 + '\']().forEach(function(item){var __c={item:function () {return item;}};%>';
    } else if ($1 === '/each') {
      return '<%});%>';
    } else if ($1.indexOf('#if ') === 0) {
      $1 = $1.slice(4).trim();
      return '<%if (__c[\'' + $1 + '\']) {%>';
    } else if ($1 === 'else') {
      return '<%} else {%>';
    } else if ($1 === '/if') {
      return '<%}%>';
    }
    return '<%=__c[\'' + $1 + '\']?__c[\'' + $1 + '\']():\'' + $0.trim() + '\'%>';
  });
  var xml = _.template(xmlTmpl, {__c: config});
  var model = JSON.parse(parser.toJson(xml));
  return new Descriptor(xml, model);
};

function toNode(node) {
  return {
    node: node,
    text: function () {
      return node['$t'];
    },
    get: function (name) {
      var child = node[name];
      if (!_.isArray(child) && typeof child === 'object') {
        child = [child];
      }
      if (_.isArray(child)) {
        child = child.map(toNode);
      }
      return child;
    },
    select: function (path) {
      return jsonpath(node, path);
    }
  };
}

module.exports = Descriptor;
