# Changes

## 0.1.0-alpha.2 — Device Alchemy image evidence

Device Alchemy now has a browser camera library: explicit permission-based capture, local photo import, manual perspective correction, and IndexedDB image storage. PNG and JPEG images can be attached to an allocated device and the exact build revision. SHA-256 checks detect changed image bytes, and corrected images retain their original lineage.

Passing capture checks now require attached evidence. Checks can require multiple original images; multiple crops of one original count once. Declared test fixtures cannot satisfy a passing capture check. A portable evidence bundle includes the workspace and all referenced photos, refusing missing or altered files.

Validation: 45 core/API tests, strict TypeScript, emitted ESM, formatting checks, and a real Chromium API run with a synthetic 1920 × 1080 camera. Browser checks cover capture, correction, image import, persistence, bundles, stale builds, denial, late permission grants, disconnection, and stopping tracks. GitHub CI adds a dedicated Chromium job alongside Node.js 22 and 24.

Compatibility: older metadata-only builds remain readable when they have no dangling artifact references. A capture pass without an attached image no longer yields a complete reported pass. Changed recipe definitions make older build revisions stale.

Limits: this is a developer-facing camera component. The visual workbench, physical camera trials, actual assembly demonstrations, secure phone pairing, and dimensioned fabrication remain unfinished. A checksum and an owner-reported pass do not prove physical success or independently authenticate a scene.
