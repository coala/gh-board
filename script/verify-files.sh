#!/bin/bash
set -e -x

# Verify files exist
files=( "issues.json" "recent-issues.json" )
for file in "${files[@]}"
do
  if [[ -f "$file" ]]; then
    echo "File $file exists."
  else
    echo "File $file does not exist."
    exit 1
  fi
done
