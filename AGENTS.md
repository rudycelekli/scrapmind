# SCRAPMIND contributor instructions

This is an independent open-source maker project, not a Snorkel client engagement. Do not apply Snorkel branding, client communications, engagement sheets, or handoff procedures here.

## Product contract

- Turn available materials and devices into useful, inspectable configurations.
- Device Alchemy is part of SCRAPMIND, not a separate product.
- Distinguish inventory matching, software execution, user-reported trials, and independent physical validation.
- A model may propose recipes. It never establishes dimensions, compatibility, rated loads, or successful physical tests.
- Starter inventory is labeled demo data. Never present it as discovered hardware.
- Do not reuse a quantity across simultaneous roles. Revalidate builds after inventory or recipe changes.
- Keep inventory and media local unless the user explicitly requests a configured model operation.
- No background telemetry, unrequested model calls, or physical-device actuation.

## Engineering

- Node.js 22.12+, TypeScript strict mode, pinned npm lockfile.
- Validate every imported inventory and recipe with the public schemas.
- All relative TypeScript imports use `.js` so emitted ESM runs in Node.
- Run `npm run check` before pushing changes. Use behavioral and allocation-invariant tests.
- Document limitations beside the relevant feature; do not claim a general invention engine or demonstrated research novelty without evidence.
- Do not commit secrets, private inventories, captured images, or machine-specific paths.
- UI design context is captured in PRODUCT.md after the user's pending product interview. Preserve the current CLI and core while developing the interface.
