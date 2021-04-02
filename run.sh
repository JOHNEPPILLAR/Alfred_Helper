if [ -z "$1" ] 
then
    echo "Skipping re-install"
else
    echo "Remove node modules folder and package-lock"
    rm -rf node_modules
    rm package-lock.json

    echo "Check for module updates"
    ncu -u

    echo "Install updates"
    npm install
fi

echo "Run snyk"
npm run test