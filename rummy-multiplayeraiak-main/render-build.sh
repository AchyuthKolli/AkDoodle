#!/usr/bin/env bash
# exit on error
set -o errexit

npm install
cd client
npm install
npm run build
cd ..
