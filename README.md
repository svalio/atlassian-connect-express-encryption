# ap3: Node package for Express based Atlassian Plugins 3 Add-ons

About AP3 for Node.js
------


AP3 is a toolkit for creating Atlassian Plugins 3 add-ons with [Node.js](http://nodejs.org/). Plugins 3 is a new kind of Atlassian add-on framework that works with Atlassian OnDemand applications. 

In Plugins 3, add-ons provide their services from afar. They run on a remote web server and communicate with OnDemand applications entirely by HTTP. The AP3 toolkit helps you get started developing add-ons quickly, using Node.js as the remote add-on host.  

AP3 provides: 

* New project scaffolding with essential code elements in place.
* Code library for Plugins 3-specific functions, such as registering your remote add-on with an OnDemand instance for testing.  
* Utility for generating security keys to enable OAuth authentication between the node.js server and the Atlassian host. 

Get started!


Installing AP3
-----

You first need to have node.js installed. If you don't already have it, you can get it from [http://nodejs.org/download/](http://nodejs.org/download/). 

Equipped with node.js, you can use its package manager utility npm to install AP3. From the command line, enter:

`[sudo] npm i -g ap3-cli` 

Now you can create your add-on project. 


Creating a project with AP3
-----

From the directory where you want to put the new project home directory, enter: 

`ap3 new myproject`

Where _myproject_ is the name to use for your project home directory.

This gives you the project scaffolding. 



What's next?
-----

The project's Getting Started wiki takes you from there (it should pop up automatically in your browser), but you will have to round out the new app by first running:

`npm install`

