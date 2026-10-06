# NUKE Underdog Exposure

Chrome extension for tracking daily draft exposure by sport and tournament.

## v0.9.0

- Full player names from structured Underdog player data, with player and appearance IDs retained.
- Includes the supplied 545-player NFL identity catalog. It contains no ownership percentages.
- One shared identity resolver for the Players, Combos, Drafts, and live badges.
- Shared surnames require a player ID or enough position/team evidence; ambiguous legacy records are labeled `identity unconfirmed`.
- Exact tournament selection remains available before any entries are captured. A new tournament starts at zero completed drafts.
- Active tournament changes follow single-page navigation, visible tournament titles, clicked lobby cards, and structured route metadata.
- A lobby with multiple tournaments starts at `CHOOSE TOURNAMENT`; select the desired tournament to inspect it. `ALL TOURNAMENTS` remains an explicit aggregate option.
- Official ownership caches must match both sport and tournament. Legacy global caches are ignored for percentages; previous drafts remain in history.
- Distinct real draft IDs retain separate entries even when their rosters are identical.

## Update an existing installation

1. Extract the download and replace the files in the folder already loaded into Chrome.
2. Open `chrome://extensions` and click **Reload** on NUKE Underdog Exposure.
3. Refresh the Underdog tab so its content script updates too.

## First installation

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the extracted `NUKE-Underdog-Exposure` folder containing `manifest.json`.

No credentials are collected or stored. Draft data stays in Chrome local storage.

## Development

Run `npm ci` and `npm test`. Regression tests exercise the actual popup/content scripts in DOM fixtures, identity matching, saved-data migration, zero-entry tournaments, scope transitions, and rejection of unscoped ownership.
