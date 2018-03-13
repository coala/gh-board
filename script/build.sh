#!/bin/bash

npm run build
$(npm bin)/concurrently --kill-others --success first \
"$(npm bin)/http-server ." "node ./script/fetch-issues.js"
