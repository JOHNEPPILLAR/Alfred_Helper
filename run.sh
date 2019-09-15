#!/bin/bash
clear
echo "Updating 3rd party libs"

rm -rf node_modules
ncu -u
npm update
npm install
npm audit
snyk test
