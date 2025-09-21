#!/bin/bash

# Script to prepare files for Flathub submission

echo "Preparing Nuru Browser for Flathub submission..."

# Create the apps directory structure
mkdir -p apps/org.nuru.browser

# Copy the manifest file
cp org.nuru.browser.yml apps/org.nuru.browser/

# Copy the desktop file
cp org.nuru.browser.desktop apps/org.nuru.browser/

# Copy the appdata file
cp org.nuru.browser.appdata.xml apps/org.nuru.browser/

# Copy and rename the icon
cp logo/Nuru.png apps/org.nuru.browser/org.nuru.browser.png

echo "Files prepared in apps/org.nuru.browser/"
echo ""
echo "Next steps:"
echo "1. Fork https://github.com/flathub/flathub"
echo "2. Clone your fork: git clone --branch=new-pr git@github.com:YOUR_USERNAME/flathub.git"
echo "3. Copy the apps/org.nuru.browser/ directory to your flathub fork"
echo "4. Commit and push your changes"
echo "5. Create a pull request"
echo ""
echo "See FLATHUB_SUBMISSION.md for detailed instructions."
