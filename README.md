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

The fastest way to get started is to install the `feebs-cli` tool. The CLI makes it possible to generate a `feebs` enabled add-on scaffold very quickly. To install:

    npm i -g feebs-cli

### Create a project

Let's start by creating an add-on project:

    feebs new <project_name>

This will create the following code:

    .
    ├── README.md
    ├── app.js
    ├── atlassian-plugin.xml
    ├── config.json
    ├── package.json
    ├── private-key.pem
    ├── public
    │   ├── css
    │   │   └── main.css
    │   └── js
    │       └── main.js
    ├── public-key.pem
    ├── routes
    │   └── index.js
    └── views
        ├── example.jade
        └── layout.jade

### Install dependencies

Go into your new project directory, then install the dependencies:

    npm install

### Setting up a development environment

At this point, you're all set to run your add-on, but you'll need to have a host (i.e., JIRA or Confluence) for your add-on. You have a few options:

1. You can do all your development work locally using the [p3-dev-env-vagrant Vagrant box](https://bitbucket.org/rmanalan/p3-dev-env-vagrant). This Vagrant box will set up a local JIRA or Confluence VM (using [VirtualBox](https://www.virtualbox.org/)). This is by far the most flexible option.
2. Soon you'll be able to register a local add-on inside an Atlassian OnDemand instance in development mode. STAY TUNED!

### Running your Add-on Server

If you've chosen the first option and have a running instance of the Vagrant box, you're all set. Now all you need to do to run your add-on inside your local JIRA or Confluence instance is:

    node app.js

This will boot up your Express server on the default port of 3000 and do the following:

* Register your add-on's `atlassian-plugin.xml` (at <http://$hostname:3000/atlassian-plugin.xml>) with the host
* Start watching for changes to your `atlassian-plugin.xml`. If the file is modified, `feebs` will re-register your add-on with the host.

### The Dev Loop

At this point, you can start building your add-on. Changes to views will load automatically, however, if you make changes to any JavaScript, you will need to restart Express. If you want your server to automatically restart when your JavaScript changes, you may want to consider using [nodemon](https://npmjs.org/package/nodemon) or the like.

As you've noticed, `feebs` automatically registers your add-on with the host when it's started. Another nice feature is that it automatically de-registers it at shutdown `<ctrl-c>`.

### Configuration

The configuration for your add-on is done in two files:

* `./config.json` -- This file contains the configuration for each runtime environment your plugin runs in. The file has comments to help you understand the settings available.
* `./atlassian-plugin.xml` -- This file is a manifest of all the "plugin points" your add-on uses. To see all of the available plugin point options check out the interactive guides for [JIRA](http://atlassian-connect.herokuapp.com/help#jira/atlassian-plugin) or [Confluence](http://atlassian-connect.herokuapp.com/help#confluence/atlassian-plugin).

## Recipes

### How to configure `config.js`

### How to use `atlassian-plugin.xml`

### How to secure a route with OAuth

### How to send a signed outbound HTTP request back to the host

## Getting Help or Support

The `feebs` tools are currently experimental. With that said, feel free to [report issues](https://bitbucket.org/atlassian/node-feebs/issues?status=new&status=open). If you want to learn more about Atlassian's Plugins 3 framework, you can visit <https://developers.atlassian.com>.

## Contributing

Even though this is just an exploratory project at this point, it's also open source [Apache 2.0](https://bitbucket.org/atlassian/node-feebs/src/master/LICENSE.txt). So, please feel free to fork and send us pull requests.
