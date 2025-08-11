# Whatnot Sales Tracker

Lightweight Chrome extension that automatically shows total sales and estimated after-fee earnings directly on Whatnot livestream pages. No clicks required.

## Installation

1. Download this repository as a ZIP and unzip it (or clone it)
2. In Chrome, open `chrome://extensions/`
3. Enable Developer mode (top-right)
4. Click "Load unpacked" and select the project folder

## How it works

- When you visit a Whatnot livestream (`https://www.whatnot.com/live/...`), the extension injects a small widget into the left panel, directly under the stream title.
- It fetches sold items via Whatnot's GraphQL API (using your browser session), totals them up, and shows:
  - Total Sales
  - Estimated After Fees
  - Items Sold
- The widget updates automatically every 10 seconds and stays in place even as the page UI updates or you navigate between streams.

## Popup behavior

- The popup is intentionally minimal. It only shows whether tracking is currently running for the active tab:
  - "Whatnot Sales Tracker is currently running" when you're on a livestream page.
  - "Whatnot Sales Tracker is not currently running" otherwise.

## Permissions

- `tabs`: required so the popup can detect whether the active tab is a livestream page.
- Host access to `*.whatnot.com` so the content script can run and fetch sales while you are on Whatnot.

## Notes & troubleshooting

- If you don't see the widget, refresh the page once after installing or reloading the extension.
- The widget appears just under the stream title in the left sidebar. If Whatnot significantly changes their DOM/CSS, selectors may need to be updated.
- Totals are estimates and use an 8% Whatnot fee and 2.9% - $0.30 processing fee per item.
