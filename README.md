# Firefly Sample App: Throttled Queue Processing

This headless application manages the processing of a queue of tasks which requires communication with a throttled external system. In particular, it retrieves short URLs from bit.ly for which request threshold depends on the pricing plans.

## Setup

Populate the `.env` file in the project root with the values as shown in the [sample dot-env file](./dot-env)

## Local Dev

- `aio app run` to start your local Dev server
- Actions are automatically deployed after a code file is saved
- There is no UI in this headless app

## Test & Coverage

- This sample app does not have any tests yet. You should try it out in a development environment.
- The sample E2E and unit tests are automatically generated by the AIO App Plugin.
- Run `aio app test` to run unit tests for actions
- Run `aio app test -e` to run e2e tests

## Deploy & Cleanup

- `aio app deploy` to build and deploy all actions on Runtime and static files to CDN
- `aio app undeploy` to undeploy the app
