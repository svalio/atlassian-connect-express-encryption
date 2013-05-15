# feebs: Node.js package for Express based Atlassian Add-ons

`feebs` is a toolkit for creating [Atlassian Connect](https://developer.atlassian.com/display/AC/Atlassian+Connect) based Add-ons with [Node.js](http://nodejs.org/). Atlassian Connect is a distributed component model for creating Atlassian Add-ons. Add-ons built with Atlassian Connect extend Atlassian products over standard web protocols and APIs.

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

1. You can do all your development work locally using an Atlassian Connect Vagrant box ([JIRA](https://bitbucket.org/rmanalan/atlassian-connect-jira-vagrant) or [Confluence](https://bitbucket.org/rmanalan/atlassian-connect-confluence-vagrant)). This Vagrant box will set up a local JIRA or Confluence VM (using [VirtualBox](https://www.virtualbox.org/)). This is by far the most flexible option.
2. Soon you'll be able to register a local add-on inside an Atlassian OnDemand instance in development mode. STAY TUNED!

### Running your Add-on Server

If you've chosen the first option and have a running instance of the Vagrant box, you're all set. Now all you need to do to run your add-on inside your local JIRA or Confluence instance is:

    node app.js

This will boot up your Express server on the default port of 3000 and do the following:

* Register your add-on's `atlassian-plugin.xml` (at <http://localhost:3000/atlassian-plugin.xml>) with the host
* Start watching for changes to your `atlassian-plugin.xml`. If the file is modified, `feebs` will re-register your add-on with the host.

### The Dev Loop

At this point, you can start building your add-on. Changes to views will load automatically, however, if you make changes to any JavaScript, you will need to restart Express. If you want your server to automatically restart when your JavaScript changes, you may want to consider using [nodemon](https://npmjs.org/package/nodemon) or the like.

As you've noticed, `feebs` automatically registers your add-on with the host when it's started. Another nice feature is that it automatically de-registers it at shutdown `<ctrl-c>`.

### Configuration

The configuration for your add-on is done in two files:

* `./config.json` -- This file contains the configuration for each runtime environment your plugin runs in. The file has comments to help you understand the settings available.
* `./atlassian-plugin.xml` -- This file is a manifest of all the extension points your add-on uses. To see all of the available extension point options check out the interactive guides for [JIRA](http://atlassian-connect.herokuapp.com/help#jira/atlassian-plugin) or [Confluence](http://atlassian-connect.herokuapp.com/help#confluence/atlassian-plugin).

#### config.json

The `./config.json` file contains all of the settings for the add-on server. This file is broken into environments.

    {
      // This is the default environment. To change your app to
      // use a different env, set NODE_ENV 
      // (http://expressjs.com/api.html#app.configure)
      // "development" is the default environent.
      "development": {

        // Used as the base URL to run the server on. This is
        // optional and often used only in "production" mode.
        // "localBaseUrl": "http://localhost"

        // Express will listen on this port
        "port": 3000,

        // feebs currently provides two types of stores (memory
        // and postgres) to store the host client information
        // (i.e., client key, host public key, etc.). Default
        // is "memory"
        //
        // "store": {
        //   "type": "postgres",
        //   "connection": "postgres://localhost/pglocal"
        // },

        // Your add-on will be registered with the following hosts
        // upon startup. In order to take advantage of the automatic 
        // registration/deregistration, you need to make sure that 
        // your Express app calls `addon.register()` (see app.js).
        "hosts": [
          "http://admin:admin@localhost:1990/confluence",
          "http://admin:admin@localhost:2990/jira"
        ]
      },

      // "production" is the environment you'll typically use
      // in "production" -- duh!
      "production": {
        "port": "$PORT",
        // In "production" mode, you'll want to set the URL
        // where your app will reside.
        "localBaseUrl": "https://your-subdomain.herokuapps.com",
        // You won't want to use the "memory" store in production
        // mode.
        "store": {
          "type": "postgres",
          "connection": "$DATABASE_URL"
        }
      }
    }


### atlassian-plugin.xml

The `atlassian-plugin.xml` describes what your add-on will do. There are three main parts to the descriptor: meta information that describes your add-on (i.e., name, description, key, etc.), permissions and authentication information, and a list of the components your add-on will extend. This descriptor is sent to the host (i.e., JIRA or Confluence) when your add-on is installed.

To see all of the available settings in the `atlassian-plugin.xml`, visit the interactive descriptor guides:

* [JIRA](http://atlassian-connect.herokuapp.com/help#jira/webhook)
* [Confluence](http://atlassian-connect.herokuapp.com/help#confluence/webhook)

## Sample Add-ons using `feebs`

* [Sequence Diagramr](https://bitbucket.org/rmanalan/sequence-diagramr) -- a simple Confluence remote macro for creating UML sequence diagrams
* [Tim's Word Cloud](https://bitbucket.org/tpettersen/confluence-ap3-word-cloud) -- a macro that takes the contents of a page and constructs an SVG based word cloud
* [TaskMaster](https://bitbucket.org/mrdon/taskmaster-plugin) -- create JIRA subtasks like a ninja
* [Atlassian Connect Webhook Inspector](https://bitbucket.org/rmanalan/webhook-inspector) -- a simple tool to log webhooks fired in Atlassian apps for development purposes.

## Recipes

### How to secure a route with OAuth

Add-ons are secured through [two-legged OAuth](http://todo). To simplify OAuth verification on your routes, you can simply add a `feebs` middleware to your route:

    module.exports = function (app, addon) {
        app.get('/protected-resource',

            // Protect this resource with OAuth
            addon.authenticate(),

            function(req, res) {
              res.render('protected');
            }
        );
    };

Simply adding the `addon.authenticate()` middleware will protect your resource. To understand how Express middleware works, read up on the [Connect framework](http://www.senchalabs.org/connect/) which is what Express uses as it's middleware framework.

### How to send a signed outbound HTTP request back to the host

`feebs` bundles and extends the awesome [request](https://github.com/mikeal/request) HTTP client. To make OAuth signed request back to the host, all you have to do is use `request` the way it was designed but use a relative path as your URL back to the host's REST APIs. If `request` finds that you're using a relative URL, it will get signed. If you use an absolute URL, it bypasses signing.

    var httpClient = addon.httpClient(req);
    httpClient.get('/', function(err, resp, body){
      ...
    });

### How to deploy to Heroku

Deploying Node.js apps on Heroku is covered [here](https://devcenter.heroku.com/articles/nodejs#declare-process-types-with-procfile).

Before you start, install the [Heroku Toolbelt](https://toolbelt.heroku.com/).

Next, create the app on Heroku:

    heroku apps:create <add-on-name>

Then you have to set the public and private key as environment variables in Heroku (you don't ever want to commit these `*.pem` files into your scm).

    heroku config:set AP3_PUBLIC_KEY="`cat public-key.pem`"
    heroku config:set AP3_PRIVATE_KEY="`cat private-key.pem`"

You'll also need to make sure that your `NODE_ENV` is set to `production`:

    heroku config:set NODE_ENV="production"

Next, let's store our registration information in a Postgres database. In development, you were likely using the memory store. In production, you'll want to use a real database.

    heroku addons:add heroku-postgresql:dev

Lastly, let's deploy!

    git push heroku master

It will take a minute or two for Heroku to spin up your add-on. It will need to install node and all of it's dependencies. When it's done, you'll be given the URL where your add-on is deployed, however, you'll still need to register it on your Atlassian instance.

Currently, you can't register to an OnDemand instance directly. Atlassian is working on this... more info soon. However, if you're running your own instance of JIRA or Confluence with the `remotable-plugins` plugin (i.e., Atlassian Connect), you can run this curl command to install your add-on:

    curl -v -u <sysadmin-user> -X POST -d url=<heroku-url-to-your-atlassian-plugin.xml> http://<your-atlassian-hostname><:port>/<context>/rest/remotable-plugins/latest/installer

You'll get a `200` HTTP status if the registration is successful.

## Troubleshooting

### "Unable to connect and retrieve descriptor from http://localhost:3000/atlassian-plugin.xml, message is: java.net.ConnectException: Connection refused"

You'll get this error if JIRA or Confluence can't access `http://localhost:3000/atlassian-plugin.xml`. This could happen if you're using the Vagrant boxes and your machine's hostname is set to `localhost` instead of something else. One way to debug this is to see what `hostname` returns:

    $ hostname

If it returns `localhost`, change it. On a OS X, you'll need to set a proper "Computer Name" in System Preferences > Sharing.

## Getting Help or Support

The `feebs` tools are currently experimental. With that said, feel free to [report issues](https://bitbucket.org/atlassian/node-feebs/issues?status=new&status=open). If you want to learn more about Atlassian Connect, you can visit <https://developer.atlassian.com/display/AC>.

## Contributing

Even though this is just an exploratory project at this point, it's also open source [Apache 2.0](https://bitbucket.org/atlassian/node-feebs/src/master/LICENSE.txt). So, please feel free to fork and send us pull requests.
