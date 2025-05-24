# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2025-05-20

- Initial release with features:
  - Modern UI (frameless window, tab system, rounded borders)
  - Dark Mode (automatic system detection, brightness/contrast settings)
  - Animated Controls (interactive navigation buttons and menu controls)
  - Minimal Interface (clean, distraction-free browsing)
  - Hardware Acceleration (WebGL support with automatic detection)
  - Auto Updates (built-in update system)
  - Diagnostics (Ctrl+D, app info, WebGL status, logs)
  - Zoom Control (Ctrl+/ Ctrl-)
  - Persistent Settings (window geometry, zoom, preferences)
  - Ad Blocker (blocks ads via domain-based filtering)
  - Sponsor Skipper (skips sponsored segments in videos)
  - Search Engine Customization
  - Settings UI (built-in settings modal)
  - Development Mode (additional debugging features)
  - Custom Taskbar Icon (48×48 Nuru logo)
  - Reading Mode (article reading mode for distraction-free view)
  - Resource Manager (manage custom resources/categories)
  - Search History & Suggestions (persistent history, suggestion dropdown)
  - External Link Handling (open links in tabs instead of new windows)
  - Enhanced Context Menu (copy, paste, open link in new tab, diagnostics, bookmarks, settings)
  - Media Progress Tracking (audio/video playback progress injection)
  - Social Login Protection (disable social login elements and pop-ups)

## [1.0.1] - 2025-05-20

- fix: settings modal close button now closes window
- fix: all settings UI elements maintain their state on modal reopen

## [1.0.2] - 2025-05-20

- fix: settings modal close button now closes window properly

## [1.0.3] - 2025-05-24

- feat: tabs viewport open by default; added "Viewports hidden by default" toggle under Layout settings
- fix: conditional auto-hide behavior for tabs and history viewports based on new setting
- fix: restored history viewport hide-on-mouseleave and click-outside logic for history panel
- fix: removed `.titlebar-padding` and adjusted `#webview-container` border position and thickness
- fix: reduced border thickness to 0.5px and corner radius to `var(--radius-md)` for main viewport container
- fix: updated main viewport CSS to shrink (`width: calc(100% - 280px)`) when tabs pane is open to prevent overflow
- fix: synchronized `tabs-viewport` and `history-viewport` top offsets and heights using `--spacing-sm`

## [1.0.4] - 2025-05-24

- feat: relocated reload button to footer
- chore: repositioned clock to the right in header
- style: nav buttons fully visible and shifted right
- style: search bar adheres to theme and removed text shadows
- chore: removed microphone icon and related event handlers
- fix: suppressed errors arising from missing mic icon listeners
- docs: updated changelog for these changes

<!-- Add future changes below --> 