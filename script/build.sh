#!/bin/bash

npm run build
$(npm bin)/http-server --no-sandbox . &
node ./script/fetch-issues.js
