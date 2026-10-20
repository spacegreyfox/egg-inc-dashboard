# Features and accuracy

## What “live” means

The server checks once a minute by default, with 2-minute and 5-minute options. Multiple browser tabs share that collector. Manual refresh respects the same interval and API retry delays.

**Last checked** is when this app last collected a backup. **Game backup** is the game’s uploaded timestamp. Refreshing cannot force the game to upload newer data. Open Egg, Inc. and allow it to sync if stats are old. Co-op response timestamps indicate retrieval, and member farms have independent timestamps when supplied.

Reported totals remain authoritative. Calculated metrics use the actual purchased research, vehicles, train lengths, habitats, artifacts, stones, Eggs of Truth, recorded colleggtible milestones, and contract grade modifiers. Forecasts are separate:

- The overview can display an **offline scenario** population for up to five minutes after the saved farm timestamp. It assumes you remained offline, and is bounded by silo duration, habitat capacity, and the earliest saved boost expiration. It is hidden if those prerequisites are unknown or an individual habitat is already full.
- Contract completion estimates assume the current reported combined rate holds. Boosts, silo exhaustion, and future growth can change them. They never increment reported delivered totals.

## Data and history

The private database is `data/farm.sqlite` (plus SQLite sidecar files). It is Git-ignored. The local EID, latest backup/co-op responses and compact historical observations live there. There is no public deployment, analytics service, or community API relay: only the local server contacts Auxbrain’s game API.

The server binds to IPv4 loopback, checks Host and Origin, and masks the EID in public state. Member identifiers are hashed before reaching UI/history URLs. EIDs and response contents are not logged. This is a local personal tool; it has no login and does not expose a LAN interface.

History begins when recording starts and is retained indefinitely. Unchanged source snapshots do not create new observations. Charts preserve collection outages, counter decreases, new eggs/prestiges, and repeated contract runs. A delayed game upload alone does not create a gap while checks remain healthy. Previously saved gap flags are retained; old observations are not rewritten. The History page can export exact saved values as CSV. JavaScript doubles from the game retain their source precision; protobuf 64-bit counters are kept as decimal strings. Chart geometry uses approximate floating-point values, with exact saved values in tooltips/tables/CSV.

Contract goal progress includes numbered flags at the actual egg targets. Reached goals turn green, the next goal is gold, and each milestone shows its reported remaining eggs. Hover or focus a flag or goal card for full numbers. Only reported delivered totals unlock milestones.

### Contract population comparison

Contracts now includes a population chart for your farm (blue circles) and a selected co-op partner (red triangles), with 1-hour, 24-hour, 7-day and 30-day ranges. Both populations are read from the co-op response when supplied. Your earlier backup population history for the same contract run is also included. Solo contracts can show your saved farm before co-op membership exists. Larger co-ops have a partner selector.

The comparison graph shows population only. Habitat capacity, occupancy bars, and remaining space appear in the player summaries below it. A green “Habs full” badge appears in the player summary and member table only when known population reaches known capacity. Rounded numbers never determine full status; unknown capacity stays unavailable. The member table includes sortable habitat capacity and occupancy.

Member history records a usable farm timestamp when available. Some responses supply populations with an unusable or missing farm timestamp; those readings are recorded at the successful co-op check time, which is labeled in tooltips, History and CSV (`time_basis`). The unknown farm timestamp remains unavailable in the member table. Unchanged member metrics do not create new saved observations, and failed co-op reads do not create samples. Partner history starts with recording; the latest cached reading can appear as a single point, but earlier readings are never reconstructed. Lines appear once another observation is available. Runs are kept separate and collection gaps remain dashed.

Replacing an account requires explicit acknowledgement and removes the previous local history. Settings → Delete local data removes all saved dashboard records; neither action changes your game. Export history first if needed. To back up the complete database, stop the server and copy `data/farm.sqlite`.

## Verification limits

- Tests use synthetic fixtures. Supported calculations have regression coverage; exact agreement with every in-game Stats screen value has not been verified.
- The game API is unofficial and can change. Unsupported research/equipment suppresses dependent calculated metrics instead of guessing. Each unavailable metric explains why; common research does not suppress the separate equipped earnings bonus. Missing uploaded fields remain unavailable.
- Older saves may retain `epic_silo_quality` and `warp_shift`. These save-only compatibility entries are outside the current reference formulas and do not block supported farm calculations. They are not aliased to a differently named modern upgrade. Truly unrecognized positive-level research still triggers a diagnostic. An omitted repeated protobuf research list means no purchases.
- Only boost records with a name and positive saved remaining time are treated as normal active boosts. Empty/expired slots are ignored. Malformed or unrecognized active boosts explain why hatchery rates/forecasts cannot be calculated; unrelated farm metrics remain available.
- On restart, the latest cached save is recalculated using the current code without rewriting observations, claiming a newer game timestamp, or making an extra request. This lets fixes appear immediately even if the upstream API is temporarily unavailable.
- Enlightenment’s artifact/clarity behavior is not yet validated: calculated rates for that egg are withheld, while reported population, balances, and counters remain visible.
- Your own contract farm’s local laying rate is withheld because teammate deflectors are not inferred from a potentially older backup. Use the contract panel’s reported effective delivery rate instead. Online/offline internal hatchery rates are **per habitat**; they are not an unconditional population growth promise.
- The app shows equipped earnings bonus, not transient running-chicken bonus or moment-to-moment cash earnings. Event-adjusted cash earnings are not forecast. Live metadata failure does not erase saved data and is shown on the dashboard.
- Saved egg totals are labeled by backup index pending verification of the game’s array indexing. They are intentionally not assigned speculative egg labels.
- History is not retroactively reconstructed. No notifications, auto-login startup, rocket tracker, artifact optimizer, full inventory browser, or Virtue planner is included.

