#!/bin/bash

npm run build
$(npm bin)/http-server . > http.log 2>&1 &
node ./script/fetch-issues.js
