echo "Installing latest"
#rm -rf node_modules
#rm package-lock.json
ncu -u
npm install
npm audit fix
snyk test