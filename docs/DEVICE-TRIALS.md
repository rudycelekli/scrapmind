# Device Alchemy capability trials

A camera can be present in an inventory without being usable by its chosen host. `runCameraTrial()` explicitly opens a selected browser camera, waits for an arriving video frame, encodes and decodes a still image, records its byte checksum and pixel dimensions, and releases the camera. A failure returns a recorded failure without a passing artifact.

This trial establishes one narrow software observation: the selected browser source produced a decodable image. It does not establish which physical inventory item the source represents, usable focus, optical resolution, mounting fit, illumination quality, or physical assembly success.

## Run and confirm a trial

```ts
import { runCameraTrial, applyCameraTrial, ImageStore } from './core/index.js';

// Invoke from the owner's explicit test action, using their inventory and
// selected browser device. No trial runs when the library is imported.
const result = await runCameraTrial(item, {
  context: 'owner-device',
  deviceId: selectedBrowserDeviceId,
});

if (result.image) {
  const store = await ImageStore.open();
  try {
    await store.put(result.image);
  } finally {
    store.close();
  }

  // Obtain this confirmation from the owner after they examine the frame and
  // identify the selected source. A trial never supplies it automatically.
  if (ownerConfirmedDeviceAssociation) {
    inventory = await applyCameraTrial(inventory, result.trial, result.image.blob, true);
  }
}
workspace.deviceTrials.push(result.trial);
```

Applying a successful, owner-confirmed trial adds **only `camera`** to that item's tested-capability list. Other declared capabilities remain untested. The function verifies the actual image bytes, refuses a changed device configuration, and rejects declared synthetic or failed trials. Applying a new evidence label changes the full inventory fingerprint, so existing builds become stale; test the device before planning the assembly.

The device fingerprint includes its declared identity, availability, capabilities, quantity, measurements, and notes. Updating evidence labels alone does not invalidate a completed device trial. This is a configuration comparison, not hardware identity attestation. A browser cannot reliably detect every virtual or synthetic camera; the owner remains responsible for its association.

## Retain and share results

Workspaces now include `deviceTrials`. Older files default to an empty list. An evidence bundle includes a standalone trial's image alongside any build images, and verifies all referenced bytes on import. Build evidence is collected separately: a pre-build capability trial cannot silently substitute for an image of the final assembly, because its artifact is bound to the trial rather than the build.

Use `context: 'synthetic-test'` in automated tests and simulations. Such a trial is useful software evidence, and cannot be applied as an owner-device capability. The core camera suite uses this context explicitly. The visual suite also simulates owner workflows against a fake camera and records no physical validation; an automated checkbox is not an actual hardware association. No actual user's camera or physical assembly has been validated by that suite.

## Repeatable physical challenge

The first real demonstration should include an actual inventory, the camera trial, a mounted document-scanner build, its original and corrected page images, and the documented acceptance results. Record failed fits or poor images as well as successes. Then remove the allocated support, replan, inspect the substitute with the actual camera, start a new build revision, and repeat the checks. Compare the two measured trials rather than presenting a successful allocation as successful hardware.

This protocol is ready to use. No physical results are claimed or prefilled.
