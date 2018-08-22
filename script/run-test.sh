#!/bin/bash
set -e -x

script/verify-files.sh

$(npm bin)/jest
