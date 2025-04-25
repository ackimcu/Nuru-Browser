# Nuru Browser

A modern, optimized Electron-based web browser with a minimalistic interface, inspired by the Arc browser design. Features hardware acceleration, tabs management, animated controls, and a focus on performance and aesthetics.

![Nuru Browser](screenshots/Interface.png)

## Features

- **Modern UI**: Arc-inspired frameless window with a modern tab system and rounded borders
- **Dark Mode**: Sleek dark theme with Poppins SemiBold font, automatic detection of system theme, and adjustable brightness/contrast settings
- **Animated Controls**: Interactive animated navigation buttons and menu controls
- **Minimal Interface**: Clean, distraction-free browsing experience
- **Hardware Acceleration**: WebGL support with automatic detection
- **Auto Updates**: Built-in system to keep the browser up-to-date with latest releases
- **Diagnostics**: Built-in diagnostics window (Ctrl+D) with app info, WebGL status, and logs
- **Zoom Control**: Built-in zoom functionality (Ctrl+/Ctrl-)
- **Persistent Settings**: Remembers window geometry, zoom level, and other preferences
- **Ad Blocker**: Blocks ads on web pages for a cleaner browsing experience
- **Sponsor Skipper**: Automatically skips sponsored segments in videos with customizable categories and notifications
- **Search Engine Customization**: Configure default search engine name, URL, and icon
- **Settings UI**: Access and modify settings via a built-in settings modal
- **Development Mode**: Enable development mode for additional debugging features
- **Custom Taskbar Icon**: Displays a 48×48 Nuru logo in the taskbar, configured via `src/main.js`

## Development

### Prerequisites

- Node.js (v16 or later)
- npm (v8 or later)

### Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Start the application:
   ```
   npm start
   ```

### Building

To build the application for production:

```
npm run build
```

This will create distributable packages in the `dist` directory.

## Running Without Terminal

To run Nuru Browser without using the terminal, you can use the provided desktop shortcut:

1. Ensure the `NuruBrowser.desktop` file is located in `~/.local/share/applications/` or on your desktop.
2. Make the file executable:
   ```bash
   chmod +x ~/path/to/NuruBrowser.desktop
   ```
3. Double-click the shortcut to launch Nuru Browser with the app logo.

## Configuration

Settings are stored in `nuru_browser_settings.json` in the app's user data directory. Default settings:

- Dark mode: Enabled
- Frameless mode: Enabled
- Zoom factor: 1.5 (150%)
- Search engine: Google (`https://www.google.com/search?q=`, icon: `fab fa-google`)
- Development mode: Disabled
- Ad blocker: Enabled
- Sponsor skipper: Enabled
- Dark mode settings: autoDetect: true, brightnessReduction: 85, contrastEnhancement: 10

## Keyboard Shortcuts

- `Ctrl+D`: Open diagnostics window
- `Ctrl+Plus`: Zoom in
- `Ctrl+Minus`: Zoom out
- `Ctrl+S`: Show URL bar
- `Ctrl+T`: Open new tab
- `Ctrl+W`: Close current tab

## Logs

Logs are stored in `nuru_browser.log` in the app's user data directory and can be viewed in the diagnostics window.
