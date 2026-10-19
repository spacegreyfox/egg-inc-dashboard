# Privacy and sharing

This repository and its release ZIPs contain application source, public game assets, and synthetic test/demo fixtures. They do not contain a connected player's EID, database, saved game, co-op identifiers, account history, or real-farm screenshots.

When you connect an account, private information is stored in `data/farm.sqlite` and SQLite sidecar files. The latest raw game backup/co-op responses are retained locally for diagnosis. History is kept until you explicitly delete it. The dashboard sends read requests to the game API; it does not send your game information to GitHub or the project owner.

The app is intended for a trusted personal computer. Loopback access is not user authentication: other software or people with access to the same computer may be able to inspect local files and the local service.

Before reporting a bug:

- Use the synthetic demo when possible.
- Describe what is missing and include the Node version and error text after removing identifiers.
- Do not attach databases, raw responses, private exports, credentials, or a real EID.
- Check screenshots for account names, co-op names, timestamps, and game IDs before sharing them.

`npm run privacy:check` inspects files eligible for a release. It is a guardrail, not a replacement for reviewing screenshots and attachments. Private runtime data is ignored by Git and never used to generate a release ZIP.

The EIDs made of only zeroes, ones, or twos in tests and demo code are deliberately synthetic identifiers. They are not a player's saved account.
