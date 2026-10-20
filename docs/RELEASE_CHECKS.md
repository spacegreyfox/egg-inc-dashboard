# Release verification

For version 1.0.1:

- Clean dependency installation completed with the locked dependency tree and Node 24.
- All 48 automated tests passed, including collection/history, capacity/milestones, and release-privacy checks.
- TypeScript checking and the production build passed.
- The portable demo launcher was verified in a browser using only synthetic sample data.
- A fresh normal launch opened the empty EID setup screen with no account configured.
- Repository and archive contents were checked for runtime databases, exports, local user paths, real game IDs, and private identifiers.
- The README screenshot was captured from the clearly labeled synthetic demo.
- The repository starts with a new history and a neutral author identity; it does not inherit a local project's commits.

Local verification was performed on macOS. The included GitHub Actions workflow also checks macOS and Linux on Node 24. Windows behavior is not verified.
