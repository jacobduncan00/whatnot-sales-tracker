# Whatnot Sales Tracker

Lightweight Chrome extension that shows total sales and estimated after-fee earnings for Whatnot livestreams. All data is displayed in the extension popup, making it resilient to Whatnot UI changes.

## Installation

1. Download this repository as a ZIP and unzip it (or clone it)
2. In Chrome, open `chrome://extensions/`
3. Enable Developer mode (top-right)
4. Click "Load unpacked" and select the project folder

## How it works

- Open the extension popup while viewing a Whatnot livestream (`https://www.whatnot.com/live/...`)
- The extension automatically detects if you're on a livestream page and fetches sales data via Whatnot's GraphQL API
- It displays:
  - **Total Sales**: Gross revenue from all sold items
  - **Est. After Fees**: Estimated earnings after Whatnot fees and payment processing
  - **Items Sold**: Total number of items sold
- Data is fetched fresh each time you open the popup

## Popup behavior

- Click the extension icon to open the popup
- If you're on a Whatnot livestream page, it will automatically fetch and display sales data
- If you're not on a livestream page, it will show an appropriate message
- The popup shows the last update time for the displayed data

## Permissions

- `tabs`: required so the popup can detect whether the active tab is a livestream page
- Host access to `*.whatnot.com` so the popup can fetch sales data via the GraphQL API

## Notes & troubleshooting

- Make sure you're logged in to Whatnot in your browser for the extension to fetch data
- The extension no longer injects anything into the Whatnot page, so it won't break when Whatnot updates their UI
- Totals are estimates and use an 8% Whatnot fee and 2.9% + $0.30 processing fee per item
- If you see an error, make sure you're on a livestream page and logged in to Whatnot
