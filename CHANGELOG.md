# Changelog

## 1.1.0

- Added shared next-milestone and final-goal ETA calculations, anchored to reported readings, with local completion times and live countdowns.
- Added stale/paused/offline, zero-rate, elapsed-estimate and deadline states without changing reported progress.
- Replaced contract tabs with summary cards for every active contract, ordered by deadline, with run-safe selection and isolated chart/member state.
- Removed the Overview's three-contract limit and added a four-contract synthetic demo.
- Expanded tests to 56 cases. No database migration or extra upstream requests required.

## 1.0.1

- Removed habitat capacity overlays from population charts; capacity values, occupancy bars and full-hab badges remain visible separately.
