# Release verification

For version 1.2.0:

- All 65 automated tests passed, including exact pace thresholds, anchored rates/margins, stale/error/expiry states, reward alignment, production conversions, missing data, sorting and history compatibility.
- TypeScript checking and the production build passed.
- Browser QA uses the isolated, clearly labeled synthetic demo, never a real-account screenshot.
- Desktop card navigation, shared card/detail pace, goal rewards, keyboard disclosure and production sorting were verified.
- A separate local synthetic preview at a 390-pixel iframe viewport verifies narrow cards, vertically stacked rewards and internally scrolling production tables. Production server security headers remain unchanged.
- Pause/disconnect retains the last assessment and margin under “Pace unknown.” Existing population charts remain population-only, and contract-run selection stays isolated.
- Repository and source archive are checked for runtime data, local paths, non-synthetic game IDs and private identifiers. Only synthetic screenshots are included.
- Existing local account/history is preserved. New fields do not rewrite old history.

Local verification runs on macOS with Node 24; GitHub Actions checks macOS and Linux. Windows remains unverified. Exact parity with all transient in-game values is outside this release; field units follow the documented community implementation and fixture tests.
