# Device Alchemy image tools

The TypeScript library can now open a browser camera on an explicit user action, save PNG or JPEG frames, import local photos, and perform manual four-corner perspective correction. It is a working browser component; the product workbench and camera controls are still being developed.

## Capture and bind evidence

Bundle `core/index.ts` for a browser application. The camera requires localhost or HTTPS. Call `CameraSession.open()` from the user's camera action; the library never opens a sensor on import and never requests audio.

```ts
import { CameraSession, attachImage, ImageStore, recordCheck, startBuild } from './core/index.js';

// `plan` has been computed from a validated, actual inventory.
let build = startBuild(plan, crypto.randomUUID());
const cameraItem = plan.allocations.find((allocation) =>
  allocation.matchedCapabilities.includes('camera'),
);
if (!cameraItem) throw new Error('This plan has no allocated camera.');

const camera = await CameraSession.open();
try {
  const image = await camera.capture({
    id: crypto.randomUUID(),
    buildId: build.id,
    itemId: cameraItem.itemId,
    inventoryFingerprint: plan.inventoryFingerprint,
    recipeFingerprint: plan.recipeFingerprint,
  });
  const store = await ImageStore.open();
  try {
    await store.put(image);
  } finally {
    store.close();
  }
  build = await attachImage(build, plan, image.artifact, image.blob);
  // Record a pass only after examining the actual image and check procedure.
  build = recordCheck(build, plan, {
    checkId: 'frame',
    outcome: 'passed',
    note: 'All four corners of the intended page are visible.',
    recordedAt: new Date().toISOString(),
    artifactIds: [image.artifact.id],
  });
} finally {
  camera.stop();
}
```

The owner selects which inventory device corresponds to the browser camera. That association is not hardware attestation. Exported records omit persistent browser device IDs. Camera permissions, disconnection, absence of frames, and a late grant after timeout are handled explicitly. Calling `stop()` releases all stream tracks.

## Perspective correction

`correctPerspective(image, newBinding, corners, outputWidth, outputHeight)` returns a PNG. Corners use source-image pixels ordered top-left, top-right, bottom-right, bottom-left. The output must be at most six megapixels; source images must be PNG or JPEG, at most 20 MB and 24 megapixels. Correction retains the original capture timestamp and links to its parent image. Attach the original before its derivative.

Correction resamples existing pixels. It does not add optical detail, infer dimensions, run OCR, or establish that the photographed assembly works. Pixel processing currently runs on the caller's browser thread; large outputs can briefly occupy it.

## Timed sequences

`captureSequence(camera, bindingWithoutImageId, { id, count, intervalMs }, signal)` is an async generator. It yields 2–60 still images, with target intervals of 100 ms–60 seconds and at most 20 MB of encoded images per sequence. Save each yielded image before requesting the next; it does not buffer a movie or encode video. Keep the page active.

```ts
import { captureSequence, describeSequence } from './core/index.js';

const frames = [];
const cancel = new AbortController();
try {
  for await (const image of captureSequence(
    camera,
    bindingWithoutImageId,
    {
      id: crypto.randomUUID(),
      count: 3,
      intervalMs: 1000,
    },
    cancel.signal,
  )) {
    await store.put(image);
    build = await attachImage(build, plan, image.artifact, image.blob);
    frames.push({ artifact: image.artifact });
  }
  const summary = describeSequence(frames);
  // Inspect summary.intervalsMs instead of assuming exact one-second spacing.
} finally {
  camera.stop();
}
```

Each capture waits for an arriving browser video frame. Its wall-clock timestamp records the frame-copy operation; its sequence timing records elapsed monotonic browser time and the scheduling target. Late encoding or a slow consumer skips overdue schedule slots rather than bursting through them. `describeSequence()` reports actual intervals and lateness, and rejects unordered or unrelated device/build records. Corrected images preserve their original timing.

Calling the abort controller cancels a waiting sequence immediately. An in-flight encoding operation finishes before its result is discarded. Cancellation leaves an existing preview open; explicitly call `camera.stop()` when leaving the camera workflow. Stopping or disconnecting the camera also interrupts a waiting sequence. A source that stops providing arriving frames times out and is released.

Browser scheduling and clocks are not laboratory timing instruments. Long sleep or suspension can behave differently across platforms; see [MDN's performance timing notes](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now). This bounded, foreground still sequence does not imply unattended multi-day recording.

## Storage and portability

`ImageStore` uses the browser's IndexedDB. Writes and deletes are explicit. A read verifies the encoded byte count, image dimensions, MIME type, and SHA-256. Artifact IDs are immutable. Browser storage is origin-specific and may be cleared or evicted; use an explicit export to retain a backup.

`exportWorkspace()` exports inventory, recipes, build state, and image metadata, **without photo bytes**. `exportEvidenceBundle(workspace, id => store.get(id))` includes all referenced photos and refuses missing or altered media. `importEvidenceBundle(json)` validates every binding and checksum before returning a workspace and images for the caller to save. The bundle is plain JSON, limited to 20 MB of images and 35 MB total. It is a local backup format, not an encrypted container. Imported originals retain their encoded image content.

Imported photos record their import time; their capture time is unknown unless explicitly supplied as an owner claim. Browser captures record the time the frame is copied. Neither is an independently trusted clock. A checksum detects changed files; it does not certify scene authenticity or physical success.

## Build evidence rules

- A passing capture check requires images attached to the current build revision and attributed to an allocated camera.
- Observation and measurement checks still require the owner's procedure and result; a photo alone cannot establish stability or mounting fit.
- `minArtifacts` sets the minimum number of original images. Multiple crops of one original count once. Light comparison and sequence checks require two.
- A timed check can also specify `minCaptureSpanMs`. It requires ordered original frames from one sequence and device, with a measured span that meets the minimum. The starter time-lapse check requires 100 ms or more, and still asks the owner to compare the observed intervals with their intended observation.
- Declared `test-fixture` images cannot satisfy passing capture checks. A browser cannot reliably detect a synthetic or virtual sensor; synthetic test runs are identified in the test output.
- Inventory or recipe changes make prior results stale. A new build must collect its own evidence.
- `reported-pass` means the owner recorded all required steps and checks. It does not mean independent physical validation. Imported metadata can be edited; verify the bundle's actual files when auditing it.

## Reproduce the browser checks

```sh
npm ci
npx playwright install --with-deps chromium
npm run test:browser
```

To use an installed Chrome instead of downloading Chromium, set `SCRAPMIND_CHROME_EXECUTABLE` to its executable path. The runner uses a synthetic camera, blocks nonlocal requests, and exercises actual Chromium media, canvas, image decoding, IndexedDB, and cryptographic APIs. It covers capture, correction, JPEG import, storage reopening, portable image bundles, evidence binding, stale revisions, permission denial, late grants, and stopping tracks. It never tests a user's physical camera or uploads a frame.
