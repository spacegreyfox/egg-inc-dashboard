# Changelog

## 1.2.0

- Added final-goal pace badges, anchored required rates, and finish margins on every contract card and selected detail panel. Amber begins at 90% time use, with stale/paused/offline and deadline states.
- Added grade-specific milestone rewards without claiming redemption.
- Added collapsible member production details, per-chicken laying conversion, shipping limits, provenance labels, and sorting with unavailable values last.
- Fixed narrow-screen table containment and improved goal tooltip placement and keyboard table access.
- Expanded tests to 65 cases. Existing history is preserved; no migration or additional upstream requests.

## 1.1.0

- Added shared next-milestone and final-goal ETA calculations, anchored to reported readings, with local completion times and live countdowns.
- Added stale/paused/offline, zero-rate, elapsed-estimate and deadline states without changing reported progress.
- Replaced contract tabs with summary cards for every active contract, ordered by deadline, with run-safe selection and isolated chart/member state.
- Removed the Overview's three-contract limit and added a four-contract synthetic demo.
- Expanded tests to 56 cases. No database migration or extra upstream requests required.

## 1.0.1

- Removed habitat capacity overlays from population charts; capacity values, occupancy bars and full-hab badges remain visible separately.
