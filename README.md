# atlassian-connect-express: Node.js package for Express.js based Atlassian Add-ons

![build status](https://bitbucket-badges.atlassian.io/badge/atlassian/atlassian-connect-express.svg)

`atlassian-connect-express` is a toolkit for creating [Atlassian Connect](https://developer.atlassian.com/display/AC/Atlassian+Connect) based Add-ons 
with [Node.js](http://nodejs.org/). Atlassian Connect is a distributed component model for creating Atlassian add-ons. Add-ons built with Atlassian 
Connect extend Atlassian applications over standard web protocols and APIs.

**Please ensure you always use the latest patch version of atlassian-connect-express to ensure your add-on has the latest security patches and fixes. Versions prior to 1.0.14 and 2.0.2 have a known security vulnerability.**

`atlassian-connect-express` is the **officially supported** Node.js framework for Atlassian Connect. Please read our documentation to see the other 
supported and community provided [Frameworks and Tools](https://developer.atlassian.com/static/connect/docs/latest/developing/frameworks-and-tools.html). 
You will find the recommended tools extremely useful when writing your own Atlassian Connect add-ons; be sure to peruse the list of tools and use them 
as much as possible to aid development.

## More about `atlassian-connect-express`

The `atlassian-connect-express` package helps you get started developing add-ons quickly, using Node.js and Express as the add-on server.

It's important to understand that [Express](http://expressjs.com/) by itself is a web app framework for Node. `atlassian-connect-express` just provides 
a library of middleware and convenience helpers that make it easier to build Atlassian add-ons. Specifically, `atlassian-connect-express` adds:

* An optimized dev loop by handling registration and deregistration on the target Atlassian application for you at startup and shutdown
* A filesystem watcher that detects changes to `atlassian-connect.json`. When changes are detected, the add-on is re-registered with the host(s)
* Automatic JWT authentication of inbound requests as well as JWT signing for outbound requests back to the host
* Automatic persistence of host details (i.e., client key, host public key, host base url, etc.)
* Localtunnel'd server for testing with OnDemand instances

## Release Notes

For detailed release notes and upgrade guides, please see the [Release Notes](RELEASENOTES.md).

## Getting Started

The fastest way to get started is to install the `atlas-connect` CLI tool. The CLI makes it possible to generate a `atlassian-connect-express` enabled add-on scaffold very quickly. To install:

    npm i -g atlas-connect

### Create a project

Let's start by creating an add-on project:

    atlas-connect new <project_name>

This creates a new project in the current directory.

### Install dependencies

Change to the new project directory and install dependencies:

    npm install

`atlassian-connect-express` requires Node.js v4.8.4 or later. Please also ensure you have relevant [security updates](https://nodejs.org/en/blog/vulnerability/) installed.

### Setting up a development environment

At this point, you're all set to run your add-on, but you still need to install it in JIRA Cloud or Confluence Cloud. You can install your new add-on in any JIRA Cloud or 
Confluence Cloud site where you are an administrator, but usually it's best to create a new site for you to use during development. [Follow this link to sign up](http://go.atlassian.com/cloud-dev) 
for a free development version of JIRA Cloud or Confluence Cloud.

### Running your Add-on Server

In your project directory, run:

    node app.js

This will boot up your Express server on the default port of 3000.

### The Dev Loop

At this point, you can start building your add-on. Changes to views load automatically, however, if you make changes to
any JavaScript, you need to restart Express. If you want your server to automatically restart when your JavaScript
changes, consider using [nodemon](https://npmjs.org/package/nodemon) or the like.

#### Automatic Registration

This section will describe how to configure ACE so that it can automatically register your add-on with your Atlassian 
Cloud development instance, re-register on changes to the descriptor, and de-register on shut down.

To get this functionality, you will need to:

* Create a file called `credentials.json`,
* Copy and paste the contents of [this file](https://bitbucket.org/atlassian/atlassian-connect-express-template/src/master/credentials.json.sample),
* Add `credentials.json` to the `.gitignore` file, and
* Change the contents of the file to contain the link to your Cloud Development environment, admin authentication, and product

ACE will now read this file and automatically create an [ngrok](https://ngrok.com/) tunnel, and register your add-on on your development instance.

### Configuration

The configuration for your add-on is done in two files:

* `./config.json` -- This file contains the configuration for each runtime environment your plugin runs in. The file has
comments to help you understand available settings.
* `./atlassian-connect.json` -- This file is a manifest of all the extension points your add-on uses. To see all of the
available extension point options, check out the modules sections of the [atlassian-connect documentation](https://developer.atlassian.com/static/connect/docs/).

The behaviour of your add-on can be further configured by setting the `AC_OPTS` environment variable (see the end of this section).

#### config.json

The `./config.json` file contains all of the settings for the add-on server. This file is broken into environments.

```javascript
    {
      // set to true if your app contains a errorHandler middleware
      // see http://expressjs.com/guide.html#error-handling
      "expressErrorHandling" : false
      // This is the default environment. To change your app to use
      // a different env, set NODE_ENV (http://expressjs.com/api.html#app.configure)
      "development": {

        // This is the port your Express server will listen on
        "port": 3000,

        // atlassian-connect-express currently integrates with JugglingDB for persistence
        // to store the host client information (i.e., client key, host public
        // key, etc). When no adapter is specified, it defaults to JugglingDB's
        // fallback memory storage.
        //
        // To specify a backend for JugglingDB other than "memory", set the
        // "type" value to one of Juggling's other supported types.  See
        // https://github.com/1602/jugglingdb for more information.
        //
        // To use your own storage adapter, add the key
        // "adapter" to the following configuration, and replace "type" and
        // "connection" with any values your adapter expects.  Then make sure
        // that you register your adapter factory with the following code in
        // app.js:
        //
        //   ac.store.register(adapterName, factoryFn)
        //
        // See atlassian-connect-express/lib/store/index.js and the default jugglingdb.js
        // files for code demonstrating how to write a conformant adapter.  The
        // default values are as follows:
        //
        //   "store": {
        //     "adapter": "jugglingdb",
        //     "type": "memory"
        //   },
        //
        // To instead configure, say, a PostgreSQL store, the following could be
        // used:
        //
        //   "store": {
        //     "adapter": "jugglingdb",
        //     "type": "postgres",
        //     "url": "postgres://localhost/my_addon_database"
        //   },
        //
        // You will also need an appropriate JugglingDB driver if you choose something
        // other than the default "type".  In the PostgreSQL case you'd need to
        // run the following command to add the proper support:
        //
        //   $ npm install -S jugglingdb-postgres

        // If you are running provided container like Heroku you should add the
        // appropriate dependency to your package.json  file:
        //  "dependencies": {
        //    "jugglingdb-postgres": "0.0.4"
        //  }
      },

      // This is the production add-on configuration, which is enabled by setting
      // the NODE_ENV=production environment variable.
      "production": {
        // On a PaaS host like Heroku, the runtime environment will provide the
        // HTTP port to you via the PORT environement variable, so we configure
        // that to be honored here.
        "port": "$PORT",
        // This is the public URL to your production add-on.
        "localBaseUrl": "https://your-subdomain.herokuapp.com",
        "store": {
          // You won't want to use the memory store in production, or your install
          // registrations will be forgotten any time your app restarts.  Here
          // we tell atlassian-connect-express to use the PostgreSQL backend for the default
          // JugglingDB adapter.
          "type": "postgres",
          // Again, a PaaS host like Heroku will probably provide the db connection
          // URL to you through the environment, so we tell atlassian-connect-express to use that value.
          "url": "$DATABASE_URL"
        },

        // Make sure that your add-on can only be registered by the hosts on
        // these domains.
        "whitelist": [
          "*.jira-dev.com",
          "*.atlassian.net",
          "*.jira.com"
        ]
      }
    }
```

#### AC_OPTS

The AC_OPTS environment variable can be used to change the behaviour of ACE for ease of development, like so:

```
AC_OPTS=no-auth,force-reg node app.js
```

Set it to a space- or comma-delimited list containing one or more of the following values.

**force-reg** Make the add-on always register itself with running JIRAs & Confluences when it starts up (normally auto-registration only happens if the add-on is using a memory store).

**force-dereg** Make the add-on always de-register itself with running JIRAs & Confluences on shutdown (normally auto-registration only happens if the add-on is using a memory store or running in development mode).

**no-reg** Make the add-on never register itself with running JIRAs & Confluences (i.e. don't auto-register even if a memory store is being used).

**no-auth** Skip authentication of incoming requests (i.e. don't check for or validate JWT tokens).

### atlassian-connect.json

The `atlassian-connect.json` describes what your add-on will do. There are three main parts to the descriptor: meta
information that describes your add-on (i.e., name, description, key, etc.), permissions and authentication information,
and a list of the components your add-on will extend. This descriptor is sent to the host (i.e., JIRA or Confluence)
when your add-on is installed.

To see all of the available settings in the `atlassian-connect.json`, visit the module sections of the
[atlassian-connect documentation](https://developer.atlassian.com/static/connect/docs/)

If you need a pre-processing step to your descriptor, you can configure one by changing your `app.js`
so that a transformer is included in the `config`. The `descriptorTransformer` property expects to be a
function and passes in `descriptor` as an object, and the `app.config` object.

```javascript
    var addon = ac(app, { config: {
        descriptorTransformer: function(descriptor, config) {
          if (config.environment() === "production") {
              descriptor.key = "production-key";
          }
          return descriptor;
      }
    }});
```

## Sample Add-ons using `atlassian-connect-express`

* [JIRA Example](https://bitbucket.org/atlassianlabs/atlassian-connect-jira-example) -- a simple JIRA example add-on
* [Confluence Example](https://bitbucket.org/atlassianlabs/atlassian-connect-confluence-example) -- a simple Confluence example add-on
* [Sequence Diagramr](https://bitbucket.org/atlassianlabs/atlassian-connect-confluence-sequence-diagramr) -- an add-on with a Confluence remote macro for creating UML sequence diagrams
* [Confluence Word Cloud](https://bitbucket.org/atlassianlabs/atlassian-connect-confluence-word-cloud) -- a macro that
takes the contents of a page and constructs an SVG-based word cloud

## The `atlassian-connect-express` scaffold

When you generate a new `atlassian-connect-express` add-on, you're actually just downloading a copy of the
[Atlassian Connect for Express.js template](https://bitbucket.org/atlassian/atlassian-connect-express-template/).

### Handlebars layouts and templates

The base scaffold uses the [Handlebars](http://handlebarsjs.com) template library via the [express-hbs](https://github.com/barc/express-hbs) package.

Handlebars views are stored in the `./views` directory. The base template contains a `layout.hbs` and a sample page
(`hello-world.hbs`). Handlebars alone doesn't provide layouts, but the `express-hbs` package does. To apply the
`layout.hbs` layout to your template page, just add the following to the top of your template:

    {{!< layout}}

To learn more about how Handlebars works in express.js, take a look at the [express-hbs documentation](https://github.com/barc/express-hbs#readme).

### Special context variables

`atlassian-connect-express` injects a handful of useful context variables into your render context. You can access any
of these within your templates:

* `title`: the add-on's name (derived from `atlassian-connect.json`)
* `addonKey`: the add-on key defined in `atlassian-connect.json`
* `localBaseUrl`: the base URI of the add-on
* `hostBaseUrl`: the base URI of the target application (includes the context path if available)
* `hostStylesheetUrl`: the URL to the base CSS file for Connect add-ons. This stylesheet is a bare minimum set of styles
to help you get started. It's not a full AUI stylesheet.
* `hostScriptUrl`: the URL to the Connect JS client. This JS file contains the code that will establish the seamless
iframe bridge between the add-on and its parent. It also contains a handful of methods and objects for accessing data
through the parent (look for the `AP` JS object).
* `token`: the token that can be used to authenticate calls from the iframe back to the add-on service.

You can access any of the variables above as normal Handlebars variables. For example, to generate a link in your page
that links elsewhere in the host:

    <a href="{{hostBaseUrl}}/browse/JRA">JIRA</a>

## Recipes

### How to secure a route with JWT

Add-ons are authenticated through JWT. To simplify JWT verification on your routes, you can simply add a
`atlassian-connect-express` middleware to your route:

```javascript
    module.exports = function (app, addon) {
        app.get('/protected-resource',

            // Protect this resource with JWT
            addon.authenticate(),

            function(req, res) {
              res.render('protected');
            }
        );
    };
```

Simply adding the `addon.authenticate()` middleware will protect your resource.

### How to send a signed HTTP request from the iframe back to the add-on service

The initial call to load the iframe content is secured by JWT, as described above. However, the loaded content cannot
sign subsequent requests. A typical example is content that makes AJAX calls back to the add-on. Cookie sessions cannot
be used, as many browsers block third-party cookies by default. `atlassian-connect-express` provides middleware that
works without cookies and helps making secure requests from the iframe.

Standard JWT tokens are used to authenticate requests from the iframe back to the add-on service. A route can be secured 
using the `addon.checkValidToken()` middleware:

```javascript
    module.exports = function (app, addon) {
        app.get('/protected-resource',

            // Require a valid token to access this resource
            addon.checkValidToken(),

            function(req, res) {
              res.render('protected');
            }
        );
    };
```

In order to secure your route, the token must be part of the HTTP request back to the add-on service. This can be done
by using the standard `jwt` query parameter:

    <a href="/protected-resource?jwt={{token}}">See more</a>

The second option is to use the Authorization HTTP header, e.g. for AJAX requests:

```javascript
    beforeSend: function (request) {
        request.setRequestHeader("Authorization", "JWT {{token}}");
    }
```

You can embed the token anywhere in your iframe content using the `token` content variable. For example, you can embed
it in a meta tag, from where it can later be read by a script:

    <meta name="token" content="{{token}}">

### How to send a signed outbound HTTP request back to the host

`atlassian-connect-express` bundles and extends the [request](https://github.com/mikeal/request) HTTP client. To make a
JWT signed request back to the host, all you have to do is use `request` the way it was designed, but use a URL back to the host's REST APIs.

```javascript
    var httpClient = addon.httpClient(req);
    httpClient.get('/', function(err, res, body) {
      ...
    });
```

If not in a request context, you can perform the equivalent operation as follows:

```javascript
    var httpClient = addon.httpClient({
      clientKey: clientKey, // the unique client key of the tenant to make a request to
      addonKey: addonKey
    });
    httpClient.get('/', function(err, res, body) {
      ...
    });
```

By default, these requests are authenticated as the add-on. If you would like to make a request as a specific user, the
`#asUser()` method should be used. Under the covers, an OAuth2 bearer token will be retrieved for the user you've requested.

```javascript
    var httpClient = addon.httpClient(req);
    httpClient.asUser('barney').get('/rest/api/latest/myself', function (err, res, body) {
      ...
    })
```

Ensure you pass the `userKey` value into the method, and not the username.

You can also set custom headers or send a form data. Take, for example this request which attaches a file to a JIRA issue

```javascript
    var filePath = path.join(__dirname, 'some.png');
    fs.readFile(filePath, function (err, data) {
        httpClient.post({
            url: '/rest/api/2/issue/' + issueKey + '/attachments',
            headers: {
                'X-Atlassian-Token': 'nocheck'
            },
            multipartFormData: {
                file: [data, { filename: 'some.png' }]
            }
        },
        function (err, httpResponse, body) {
            if (err) {
                return console.error('Upload failed:', err);
            }
            console.log('Upload successful:', body);
        });
    });
```

### Using the product REST API

Certain REST URLs may require [additional scopes](https://developer.atlassian.com/static/connect/docs/scopes/scopes.html)
 that should be added to your `atlassian-connect.json` file.


### How to deploy to Heroku
Before you start, install Git and the [Heroku Toolbelt](https://toolbelt.heroku.com/).

If you aren't using git to track your add-on, now is a good time to do so as it is required for Heroku. Ensure you are
in your project home directory and run the following commands:

```bash
	git config --global user.name "John Doe"
	git config --global user.email johndoe@example.com
	ssh-keygen -t rsa
	git init
	git add .
	git commit . -m "some message"
	heroku keys:add
```

Next, create the app on Heroku:

    heroku apps:create <add-on-name>

Next, let's store our registration information in a Postgres database. In development, you were likely using the memory
store. In production, you'll want to use a real database.

    heroku addons:add heroku-postgresql:dev --app <add-on-name>

Lastly, let's add the project files to Heroku and deploy!

If you aren't already there, switch to your project home directory. From there, run these commands:

    git remote add heroku git@heroku.com:<add-on-name>.git
    git push heroku master

It will take a minute or two for Heroku to spin up your add-on. When it's done, you'll be given the URL where your
 add-on is deployed, however, you'll still need to register it on your Atlassian instance.

If you're running an OnDemand instance of JIRA or Confluence locally, you can install it from the add-on administration
console. See complete [getting started guide](https://developer.atlassian.com/static/connect/docs/guides/getting-started.html)
for more information.

In order to run your add-on on remote JIRA and Confluence instances, you must enter production mode. To achieve this,
set the `NODE_ENV` variable to production like so:

    heroku config:set NODE_ENV=production

For further detail, we recommend reading [Getting Started with Node.js on Heroku](https://devcenter.heroku.com/articles/getting-started-with-nodejs).

Before installing remotely on your product instance, create a marketplace listing for your add-on, generate an access
token, and install it - [as described here](https://developer.atlassian.com/static/connect/docs/developing/installing-in-ondemand.html).

## Troubleshooting

### "Unable to connect and retrieve descriptor from http://localhost:3000/atlassian-connect.json, message is: java.net.ConnectException: Connection refused"

You'll get this error if JIRA or Confluence can't access `http://localhost:3000/atlassian-connect.json`.
One way to debug this is to see what `hostname` returns:

    $ hostname

If it returns `localhost`, change it. On a OS X, you'll need to set a proper "Computer Name" in System Preferences > Sharing.

### Problems starting up in heroku, message is: TypeError: Cannot read property 'forEach' of undefined

Specify a node version of 5.12.0 in your package.json to work around [this issue](https://github.com/jugglingdb/postgres-adapter/issues/56#issuecomment-264286085).

### Debugging HTTP Traffic

Several tools exist to help snoop the HTTP traffic between your add-on and the host server:

* Enable node-request's HTTP logging by starting your app with `NODE_DEBUG=request node app`
* Check out the HTTP-debugging proxies [Charles](http://www.charlesproxy.com/) and [Fiddler](http://fiddler2.com/)
* Try local TCP sniffing with [justniffer](http://justniffer.sourceforge.net/) by running something like
`justniffer -i eth0 -r`, substituting the correct interface value

## Getting help

If you need help using Express, see the [API reference](https://expressjs.com/en/4x/api.html) or developer's guide.

If you need help developing against Atlassian products, see the [Atlassian Developer](https://developer.atlassian.com/) site.

If you need help using functionality provided by `atlassian-connect-express`, please ask in the
[Atlassian Developer Community](https://community.developer.atlassian.com/).

If you want to report a problem, please raise a support request in Atlassian Ecosystem's
[Developer Service Desk](http://go.atlassian.com/ecosystem-developer-support).

## Contributing

Even though this is just an exploratory project at this point, it's also open source
[Apache 2.0](https://bitbucket.org/atlassian/atlassian-connect-express/src/master/LICENSE.txt). So, please feel free
to fork and send us pull requests.

## Unit tests in `atlassian-connect-express`

Run `mocha test`.
