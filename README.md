# ap3: Node.js package for Express based Atlassian Add-ons

`ap3` is a toolkit for creating Atlassian Add-ons with [Node.js](http://nodejs.org/). Plugins 3 is a new kind of Atlassian add-on framework that works with Atlassian OnDemand applications. 

Atlassian Remote Add-ons run inside a web server and communicate with the host Atlassian applications entirely by HTTP. The `ap3` package helps you get started developing add-ons quickly, using Node.js and Express as the add-on server.  

It's important to understand that [Express](http://expressjs.com/) by itself is a web app framework for Node. `ap3` just provides a set of middleware and convenience helpers that make it easier to build Atlassian Add-ons. Specifically, `ap3` adds:

* An optimized dev loop by handling registration and deregistration to consuming host for you at startup and shutdown
* A filesystem watcher that detects changes to `atlassian-plugin.xml`. When changes are detected, the add-on is re-registered with the host(s)
* Automatic OAuth authentication of inbound requests as well as OAuth signing for outbound requests back to the host
* Automatic persistence of host details (i.e., client key, host public key, host base url, etc.)
* Localtunnel'd server for testing with OnDemand instances

## Getting Started

The fastest way to get started is it install the `ap3-cli` tool. The CLI makes it possible to generate an `ap3` enabled add-on scaffold very quickly. To install:

    npm i -g ap3-cli

Once installed, check out the [README](https://npmjs.org/package/ap3-cli#readme).

## Recipes

### How to configure `config.js`

### How to use `atlassian-plugin.xml`

### How to secure a route with OAuth

### How to send a signed outbound HTTP request back to the host

## Getting Help or Support

The `ap3` tools are currently experimental. With that said, feel free to [report issues](https://bitbucket.org/atlassian/node-ap3/issues?status=new&status=open). If you want to learn more about Atlassian's Plugins 3 framework, you can visit <https://developers.atlassian.com>.

## Contributing

Even though this is just an exploratory project at this point, it's also open source [Apache 2.0](https://bitbucket.org/atlassian/node-ap3-cli/src/master/LICENSE.txt). So, please feel free to fork and send us pull requests.