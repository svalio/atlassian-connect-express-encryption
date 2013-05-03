# feebs: Node.js package for Express based Atlassian Add-ons

`feebs` is a toolkit for creating Atlassian Connect based Add-ons with [Node.js](http://nodejs.org/). Atlassian Connect is a distributed component model for creating Atlassian Add-ons. Add-ons built with Atlassian Connect extend Atlassian products over standard web protocols and APIs.

## About Feebs, the name

[Atlas](http://en.wikipedia.org/wiki/Atlas_(mythology)) (in Greek mythology) was the primordial Titan who held up the celestial sphere. Atlas is paired with [Phoebe](http://en.wikipedia.org/wiki/Phoebe_(mythology)) and governs the moon.

Feebs is a common nickname for Phoebe. Together, they help create new offspring for Atlassian's products.

## More about `feebs`

The `feebs` package helps you get started developing add-ons quickly, using Node.js and Express as the add-on server.  

It's important to understand that [Express](http://expressjs.com/) by itself is a web app framework for Node. `feebs` just provides a library of middleware and convenience helpers that make it easier to build Atlassian Add-ons. Specifically, `feebs` adds:

* An optimized dev loop by handling registration and deregistration to consuming host for you at startup and shutdown
* A filesystem watcher that detects changes to `atlassian-plugin.xml`. When changes are detected, the add-on is re-registered with the host(s)
* Automatic OAuth authentication of inbound requests as well as OAuth signing for outbound requests back to the host
* Automatic persistence of host details (i.e., client key, host public key, host base url, etc.)
* Localtunnel'd server for testing with OnDemand instances

## Getting Started

The fastest way to get started is it install the `feebs-cli` tool. The CLI makes it possible to generate an `feebs` enabled add-on scaffold very quickly. To install:

    npm i -g feebs-cli

Once installed, check out the [README](https://npmjs.org/package/feebs-cli#readme).

## Recipes

### How to configure `config.js`

### How to use `atlassian-plugin.xml`

### How to secure a route with OAuth

### How to send a signed outbound HTTP request back to the host

## Getting Help or Support

The `feebs` tools are currently experimental. With that said, feel free to [report issues](https://bitbucket.org/atlassian/node-feebs/issues?status=new&status=open). If you want to learn more about Atlassian's Plugins 3 framework, you can visit <https://developers.atlassian.com>.

## Contributing

Even though this is just an exploratory project at this point, it's also open source [Apache 2.0](https://bitbucket.org/atlassian/node-feebs-cli/src/master/LICENSE.txt). So, please feel free to fork and send us pull requests.