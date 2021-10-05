# Release process

Pre-requisites: be an owner of https://npmjs.org/package/atlassian-connect-express

( Slack: [#help-connect](https://atlassian.slack.com/archives/CFGTZ99TL) )

1. Create a new release branch from master 
    ```
      > git checkout master
      > git pull
      > git checkout -b release/x.x.x
    ```
2. Update [release notes](./RELEASENOTES.md) 

3. Update the version by running `npm version` command with appropriate versioning semantic. 

    ```
      npm version (major|minor|patch|prerelease)
    ```
    This will simply bump the `version` in the package.json file and commit the changes.

4. Login to the public npm registry
    ```
      npm login --registry=https://registry.npmjs.org
    ```

5. Publish the new version
    ```
      npm publish
    ```
