# Changes

## 0.1.0-alpha.3 — Timed sequences and device trials

Device Alchemy can now capture foreground still sequences with actual elapsed-time metadata, measured intervals, cancellation, and camera-ended cleanup. Slow encoding or consumers skip overdue schedule slots. Captures wait for an arriving video frame; stalled delivery times out and releases the source. Timed acceptance checks require a coherent sequence and measured span, including the starter time-lapse recipe.

A standalone camera-frame trial opens a selected browser source, produces and decodes a still image, records its evidence, and releases the camera. Applying it requires the actual image bytes, an unchanged device configuration, and explicit owner confirmation of the device association. It updates only the tested camera capability. Declared synthetic or failed trials cannot establish an owner-device result. Trial images are included in portable evidence bundles.

Validation: 57 core/API tests, strict TypeScript, emitted ESM, formatting, and the expanded Chromium synthetic-camera suite. The suite records a three-frame sequence, measured intervals, and a standalone trial; it exercises cancellation, stopping, denied trials, stalled-frame cleanup, persistence, and portable trial-image exports. File limits now count UTF-8 bytes accurately.

Limits: the visual workbench and actual physical trials are still pending. Sequences are bounded foreground still capture, not unattended multi-day recording. A frame-producing source does not establish optical quality, mounting fit, scene authenticity, or independent hardware identity.

## 0.1.0-alpha.2 — Device Alchemy image evidence

Device Alchemy now has a browser camera library: explicit permission-based capture, local photo import, manual perspective correction, and IndexedDB image storage. PNG and JPEG images can be attached to an allocated device and the exact build revision. SHA-256 checks detect changed image bytes, and corrected images retain their original lineage.

Passing capture checks now require attached evidence. Checks can require multiple original images; multiple crops of one original count once. Declared test fixtures cannot satisfy a passing capture check. A portable evidence bundle includes the workspace and all referenced photos, refusing missing or altered files.

Validation: 45 core/API tests, strict TypeScript, emitted ESM, formatting checks, and a real Chromium API run with a synthetic 1920 × 1080 camera. Browser checks cover capture, correction, image import, persistence, bundles, stale builds, denial, late permission grants, disconnection, and stopping tracks. GitHub CI adds a dedicated Chromium job alongside Node.js 22 and 24.

Compatibility: older metadata-only builds remain readable when they have no dangling artifact references. A capture pass without an attached image no longer yields a complete reported pass. Changed recipe definitions make older build revisions stale.

Limits: this is a developer-facing camera component. The visual workbench, physical camera trials, actual assembly demonstrations, secure phone pairing, and dimensioned fabrication remain unfinished. A checksum and an owner-reported pass do not prove physical success or independently authenticate a scene.
