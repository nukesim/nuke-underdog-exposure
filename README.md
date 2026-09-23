# NUKE Underdog Exposure

Chrome extension for tracking NFL Daily Draft exposure on Underdog.

## v0.1
- Automatic completed-draft capture from Underdog pages
- Local deduplicated draft storage
- NFL week filter
- Contest filter / all-contests view
- Player exposure (draft count + percentage)
- Two-player combo exposure
- Draft audit/history tab
- Live refresh as drafts are captured

## Install locally
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Choose **Load unpacked**
4. Select this repository folder
5. Keep Underdog open while drafting

## Capture status
Underdog is a dynamic web app, so the initial content-script parser is intentionally conservative. The dashboard/storage/exposure engine is ready; capture selectors can be hardened against the live Underdog draft-results DOM as we test actual pages.

No credentials are collected or stored. Draft data stays in Chrome local storage.
