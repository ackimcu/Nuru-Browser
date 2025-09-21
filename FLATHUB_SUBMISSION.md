# Flathub Submission for Nuru Browser

This directory contains all the necessary files to submit Nuru Browser to Flathub.

## Files Required for Flathub Submission

1. **org.nuru.browser.yml** - Flatpak manifest file
2. **org.nuru.browser.desktop** - Desktop file for application integration
3. **org.nuru.browser.appdata.xml** - AppStream metadata file
4. **logo/Nuru.png** - Application icon (48x48 PNG)

## Submission Process

### Step 1: Fork the Flathub Repository
1. Go to https://github.com/flathub/flathub
2. Click "Fork" to create your own fork

### Step 2: Clone Your Fork
```bash
git clone --branch=new-pr git@github.com:YOUR_USERNAME/flathub.git
cd flathub
```

### Step 3: Create a New Branch
```bash
git checkout -b nuru-browser-submission new-pr
```

### Step 4: Add Your Application Files
1. Create a directory: `mkdir -p apps/org.nuru.browser`
2. Copy the following files to `apps/org.nuru.browser/`:
   - `org.nuru.browser.yml`
   - `org.nuru.browser.desktop`
   - `org.nuru.browser.appdata.xml`
   - `logo/Nuru.png` (rename to `org.nuru.browser.png`)

### Step 5: Commit and Push
```bash
git add apps/org.nuru.browser/
git commit -m "Add org.nuru.browser"
git push origin nuru-browser-submission
```

### Step 6: Create Pull Request
1. Go to your fork on GitHub
2. Click "New Pull Request"
3. Select your branch `nuru-browser-submission` → `flathub/new-pr`
4. Title: "Add org.nuru.browser"
5. Description: Include information about your app

## Important Notes

- The app ID `org.nuru.browser` must be unique
- All files must be properly formatted
- The manifest uses Node.js 20.11.0 and builds the app using npm
- The app includes proper desktop integration and metadata

## Testing

Before submission, you can test the manifest locally (if you have the proper build environment):
```bash
flatpak run --command=flatpak-builder org.flatpak.Builder --force-clean --sandbox --user --install-deps-from=flathub --ccache builddir org.nuru.browser.yml
```

## Support

If you need help with the submission process:
- Flathub Matrix channel: #flathub:matrix.org
- Flathub Discourse: https://discourse.flathub.org/
- GitHub Issues: https://github.com/flathub/flathub/issues
