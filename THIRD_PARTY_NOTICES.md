# Third-party notices

## Wasmegg / Wasmegg Carpet

Research tables and habitat/vehicle/boost formula references are based on:

- https://github.com/wasmegg-carpet/egg
- Reference commit: `6e118a72168cab791ce13fd8f0fe47b2851c2f8e`
- Copyright 2020–2021 github.com/fanaticscripter (aka @mk2)
- MIT license retained in `vendor/WASMEGG-LICENSE`.

## EI Coop Assistant

Protocol definitions, artifact metadata and helpers, item types/effects, image assets, and the artifact-to-item adaptation originate from or were adapted from:

- https://github.com/Kaylier/ei-coop-assistant
- Reference commit: `eb86dcac8d0c841e4b8233c805529c4c616410e3`
- Relevant files: `vendor/ei.proto`, `vendor/artifacts.ts`, `vendor/types.ts`, `vendor/effects.ts`, `vendor/custom-eggs.json`, adaptations in `server/equipment.ts`, and artwork in `public/`.
- Artifact metadata credits Forzpace, as retained in the file header.

The referenced upstream repository does not declare a general software license in the supplied snapshot or its repository license metadata. These materials retain their original ownership and are not relicensed by this dashboard's MIT license. Consult upstream for permission/terms before reusing these materials separately.

## Auxbrain / Egg, Inc.

Game imagery in `public/`, Egg, Inc. names, and game-related protocol/data originate from Auxbrain or its game assets. They remain the property of their respective owners. This project is unofficial and is not endorsed by Auxbrain. No ownership or MIT license is claimed for the game artwork.

## API implementation reference

The request-envelope behavior was informed by https://github.com/tylertms/ei_worker. The dashboard has its own read-only adapter; no player credentials or upstream signing secrets are bundled.

## npm dependencies

Runtime and development dependencies retain their own licenses, distributed through their npm packages. The locked dependency tree is in `package-lock.json`.
