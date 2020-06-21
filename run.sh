#!/bin/bash
clear
echo "Updating 3rd party libs"

rm -rf node_modules
rm package-lock.json
#ncu -u
npm install
npm audit
snyk test
