#!/bin/bash

set -e -x

npm run build
NODE_ENV=development npx babel-node script/fetch-issues.js
