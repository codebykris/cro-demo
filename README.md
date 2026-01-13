# cro-demo
CRO Demo

# VM02 CRO Test - O2 Tariff Injection (Galaxy S25 5G)

## Test page
Use:
https://www.o2.co.uk/shop/samsung/galaxy-s25-5g?optimizely_disable=true

## What this variation does
- Injects 4 new tariff cards total:
  - 2 shown when capacity is **128GB**
  - 2 shown when capacity is **256GB**
- Inserts new tariffs **before** existing tariffs.
- Adds **Online Exclusive** label to the top of inserted cards.
- Updates pricing fields based on the provided spec:
  - Upfront, monthly, device, airtime
  - Price rises for Apr 2026 (+£2.50) and Apr 2027 (+£5.00)
- Inserts an **OFFER** block and opens a popup modal on click.
- Benefits dropdown reduced to **2 benefits**:
  1) Roam freely in the EU, up to 25GB
  2) Unlimited UK Minutes & texts
- For **Unlimited** tariffs: shows **Fair usage applies** linking to O2 fair usage policy in a new tab.
- Resilient to SPA rerenders and capacity switching:
  - idempotent (won’t double-inject)
  - uses MutationObserver + click delegation for pills

## How to run (no build required)
1. Install Chrome extension **User JavaScript and CSS**
2. Open the test page URL above
3. Add the contents of:
   - `src/variation.css` into the extension’s CSS box
   - `src/variation.js` into the extension’s JS box
4. Save / enable for `www.o2.co.uk`
5. Hard refresh the page (Ctrl+Shift+R / Cmd+Shift+R)

## Notes / assumptions
- The script clones an existing tariff card DOM structure to match O2 styling and interaction patterns.
- Offer popup is implemented as a lightweight custom modal (to avoid coupling to internal O2 modal components).
- Data filter integration is not explicitly implemented beyond allowance text, but injected cards follow the same DOM structure as existing cards.
