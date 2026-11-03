# NUKE Underdog Exposure

Chrome extension for tracking daily draft exposure by sport and tournament.

## v0.9.24

- Completed entries capture full first and last names from detailed rosters and exact player/appearance IDs. Shared surnames such as Williams are retained as separate players.
- Completed automatically checks ambiguous cards, stores verified roster names, and preserves them across rescans. The scan pauses if you interact with the page and never runs during live drafting.
- Removed cross-entry surname inference and the aggregated `identity unconfirmed` player row. Unresolved slots show a syncing status while names are being fetched; they are not attributed to another Williams.
- Reload the extension, refresh Underdog, then open Completed for the tournament. The popup refresh button retries a full-name scan.

## v0.9.23

- Updated to the supplied Week 9 Battle Royale CSV: 550 player identities, current ADPs, positions, teams, and player/appearance IDs.

- Stack highlighting uses live draft-room position and team labels, including players missing from the seed catalog or whose team changed.
- QB stack signals work before the first completed draft and clear when the roster changes.
- The NFL workspace rolls forward each Tuesday in US Central time. Past weeks disappear from tournament choices and current exposure totals; stored draft history remains intact.
- Confirmed current tournaments are selectable with zero completed entries. An empty or unselected tournament never borrows another tournament's exposure.

## v0.9.0

- Full player names from structured Underdog player data, with player and appearance IDs retained.
- Includes the supplied 545-player NFL identity catalog. It contains no ownership percentages.
- One shared identity resolver for the Players, Combos, Drafts, and live badges.
- Shared surnames require a player ID or enough position/team evidence; ambiguous legacy records are repaired using detailed roster names.
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
