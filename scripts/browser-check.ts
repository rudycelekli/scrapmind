import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Real Chromium APIs with a synthetic camera. This is a software check, not a
// physical-device trial. No camera permission is granted to an actual sensor.
const bundle = await build({
  entryPoints: ['tests/browser-entry.ts'],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'Scrapmind',
  platform: 'browser',
  target: 'es2022',
});
const server = createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  if (request.url === '/library.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(bundle.outputFiles[0].contents);
  } else if (request.url === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end(
      '<!doctype html><title>SCRAPMIND synthetic browser checks</title><script src="/library.js"></script>',
    );
  } else {
    response.writeHead(404).end();
  }
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}`;
try {
  const browser = await chromium.launch({
    ...(process.env.SCRAPMIND_CHROME_EXECUTABLE
      ? { executablePath: process.env.SCRAPMIND_CHROME_EXECUTABLE }
      : {}),
    headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) =>
      route.request().url().startsWith(baseUrl) ? route.continue() : route.abort(),
    );
    await page.goto(baseUrl);
    const result = await page.evaluate(async () => {
      const lib = (window as unknown as { Scrapmind: typeof import('../tests/browser-entry.js') })
        .Scrapmind;
      const plan = lib.planRecipe(lib.recipes[0], lib.demoInventory());
      let session = lib.startBuild(plan, 'browser-build');
      const cameraItem = plan.allocations.find((entry) => entry.requirementId === 'camera')!.itemId;
      const binding = {
        id: 'browser-photo',
        buildId: session.id,
        itemId: cameraItem,
        inventoryFingerprint: plan.inventoryFingerprint,
        recipeFingerprint: plan.recipeFingerprint,
      };
      const check = (condition: unknown, message: string) => {
        if (!condition) throw new Error(message);
      };
      const rejects = async (action: () => unknown | Promise<unknown>, pattern: RegExp) => {
        try {
          await action();
        } catch (error) {
          check(pattern.test(String(error)), `Unexpected rejection: ${String(error)}`);
          return;
        }
        throw new Error(`Expected rejection: ${pattern}`);
      };
      const camera = await lib.CameraSession.open({ timeoutMs: 10000 });
      check(camera.active, 'Camera did not start');
      check(!('deviceId' in camera.settings()), 'Persistent device identity leaked');
      const original = await camera.capture(binding, 'image/png');
      check(original.artifact.width >= 2 && original.artifact.height >= 2, 'Empty capture');
      check(
        await lib.verifyImageArtifact(original.artifact, original.blob),
        'Capture checksum failed',
      );
      // Protocol simulation only: no vision model identifies objects in this synthetic camera image.
      const photoObservation = await lib.scanInventory(
        {
          inventory: lib.demoInventory(),
          image: await lib.photoDataUrl(original.blob),
          context: 'synthetic-test',
        },
        {
          baseUrl: 'http://127.0.0.1:1/v1',
          model: 'synthetic-text',
          visionModel: 'synthetic-vision',
        },
        async (_url, init) => {
          const request = JSON.parse(init!.body as string);
          check(request.model === 'synthetic-vision', 'Photo input used the wrong model');
          return new Response(
            JSON.stringify({
              choices: [{ message: { content: JSON.stringify(lib.photoObservationFixture()) } }],
            }),
          );
        },
      );
      check(
        photoObservation.scan.artifact.sha256 === original.artifact.sha256,
        'Photo observation changed the original pixels',
      );
      const width = original.artifact.width,
        height = original.artifact.height;
      const corrected = await lib.correctPerspective(
        original,
        { ...binding, id: 'corrected' },
        [
          { x: 0, y: 0 },
          { x: width - 1, y: 0 },
          { x: width - 1, y: height - 1 },
          { x: 0, y: height - 1 },
        ],
        160,
        120,
      );
      check(
        corrected.artifact.width === 160 && corrected.artifact.height === 120,
        'Correction dimensions wrong',
      );
      check(corrected.artifact.parentId === original.artifact.id, 'Lost image lineage');
      const bitmap = await createImageBitmap(corrected.blob);
      check(bitmap.width === 160 && bitmap.height === 120, 'Correction is not a decodable image');
      bitmap.close();
      const jpeg = await camera.capture({ ...binding, id: 'jpeg' });
      const imported = await lib.importImage(jpeg.blob, { ...binding, id: 'imported' });
      check(imported.artifact.source === 'imported-image', 'Import provenance lost');
      check(imported.artifact.capturedAt === undefined, 'Import invented a capture timestamp');
      const timedPlan = lib.planRecipe(
        lib.recipes.find((recipe) => recipe.id === 'timelapse-rig')!,
        lib.demoInventory(),
      );
      let timedBuild = lib.startBuild(timedPlan, 'timed-build');
      const timedBinding = {
        ...binding,
        buildId: timedBuild.id,
        recipeFingerprint: timedPlan.recipeFingerprint,
      };
      const sequenceImages: Awaited<ReturnType<typeof camera.capture>>[] = [];
      for await (const image of lib.captureSequence(camera, timedBinding, {
        id: 'browser-sequence',
        count: 3,
        intervalMs: 150,
      })) {
        sequenceImages.push(image);
        timedBuild = await lib.attachImage(timedBuild, timedPlan, image.artifact, image.blob);
      }
      const sequenceSummary = lib.describeSequence(sequenceImages);
      check(
        sequenceSummary.frameCount === 3 && sequenceSummary.elapsedMs >= 100,
        'Timed sequence did not span its required interval',
      );
      timedBuild = lib.recordCheck(timedBuild, timedPlan, {
        checkId: 'sequence',
        outcome: 'passed',
        note: 'Synthetic timed camera sequence; no physical trial.',
        recordedAt: new Date().toISOString(),
        artifactIds: sequenceImages.map((image) => image.artifact.id),
      });
      const cancel = new AbortController();
      const cancelSequence = lib.captureSequence(
        camera,
        binding,
        { id: 'cancel-sequence', count: 2, intervalMs: 60000 },
        cancel.signal,
      );
      await cancelSequence.next();
      const cancelPending = cancelSequence.next();
      cancel.abort();
      await rejects(() => cancelPending, /cancelled/);
      check(camera.active, 'Cancelling a sequence unexpectedly closed the preview');
      // Record the synthetic trial and inspect the stream cleanup separately.
      const trialItem = lib.demoInventory().find((item) => item.id === cameraItem)!;
      const originalGetMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      let trialStream: MediaStream | undefined;
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        trialStream = await originalGetMedia(constraints);
        return trialStream;
      };
      const probe = await lib.runCameraTrial(trialItem, {
        context: 'synthetic-test',
        timeoutMs: 10000,
      });
      navigator.mediaDevices.getUserMedia = originalGetMedia;
      check(
        probe.trial.outcome === 'frame-produced' && probe.image,
        'Synthetic camera trial did not produce a frame',
      );
      check(
        trialStream && trialStream.getTracks().every((track) => track.readyState === 'ended'),
        'Trial camera was not released',
      );
      await rejects(
        () => lib.applyCameraTrial(lib.demoInventory(), probe.trial, probe.image!.blob, true),
        /synthetic or failed/,
      );
      const changedBytes = new Uint8Array(await original.blob.arrayBuffer());
      changedBytes[changedBytes.length - 1] ^= 1;
      await rejects(
        () =>
          lib.correctPerspective(
            { ...original, blob: new Blob([changedBytes], { type: original.blob.type }) },
            { ...binding, id: 'tampered' },
            [
              { x: 0, y: 0 },
              { x: width - 1, y: 0 },
              { x: width - 1, y: height - 1 },
              { x: 0, y: height - 1 },
            ],
            160,
            120,
          ),
        /bytes have changed/,
      );
      const stored = await lib.ImageStore.open('scrapmind-browser-test');
      await stored.put(original);
      await stored.put(corrected);
      await stored.put(probe.image!);
      await stored.put(photoObservation.image);
      await rejects(() => stored.put(original), /immutable/);
      stored.close();
      const reopened = await lib.ImageStore.open('scrapmind-browser-test');
      const restored = await reopened.get(original.artifact.id);
      check(
        restored && (await lib.verifyImageArtifact(restored.artifact, restored.blob)),
        'Local image did not survive reopen',
      );
      session = await lib.attachImage(session, plan, original.artifact, original.blob);
      session = await lib.attachImage(session, plan, corrected.artifact, corrected.blob);
      const workspace = await lib.saveWorkbenchScan(
        {
          format: 'scrapmind-workspace' as const,
          version: 1 as const,
          name: 'Synthetic browser check',
          inventory: lib.demoInventory(),
          recipes: [],
          builds: [session],
          deviceTrials: [probe.trial],
          exportedAt: new Date().toISOString(),
        },
        photoObservation,
      );
      await rejects(
        () =>
          lib.reviewWorkbenchScan(
            workspace,
            {
              format: 'scrapmind-inventory-review',
              version: 1,
              scanId: photoObservation.scan.id,
              inventoryFingerprint: lib.inventoryFingerprint(workspace.inventory),
              confirmedPhysicalInventory: true,
              decisions: [
                {
                  proposalId: 'proposal-1',
                  action: 'add',
                  ownerNote: 'Synthetic policy test, not a physical inspection.',
                  item: {
                    id: 'synthetic-clamp',
                    name: 'Synthetic clamp assertion',
                    kind: 'tool',
                    quantity: 1,
                    available: true,
                    capabilities: ['clamp'],
                    notes: '',
                  },
                },
              ],
            },
            photoObservation.image.blob,
          ),
        /synthetic scan/,
      );
      const bundleJson = await lib.exportEvidenceBundle(workspace, (id) => reopened.get(id));
      const restoredBundle = await lib.importEvidenceBundle(bundleJson);
      check(restoredBundle.images.length === 4, 'Bundle lost image evidence');
      check(
        restoredBundle.workspace.inventoryScans?.[0].context === 'synthetic-test',
        'Bundle lost photo observation context',
      );
      check(
        restoredBundle.workspace.deviceTrials[0].context === 'synthetic-test',
        'Bundle lost the trial context',
      );
      check(
        await lib.verifyImageArtifact(
          restoredBundle.images[1].artifact,
          restoredBundle.images[1].blob,
        ),
        'Bundle damaged image bytes',
      );
      for (const step of plan.recipe.steps) session = lib.completeStep(session, plan, step.id);
      for (const acceptance of plan.recipe.checks)
        session = lib.recordCheck(session, plan, {
          checkId: acceptance.id,
          outcome: 'passed',
          note: 'Synthetic camera test; not a physical trial.',
          recordedAt: new Date().toISOString(),
          artifactIds: acceptance.evidenceKind === 'capture' ? [original.artifact.id] : [],
        });
      check(
        lib.buildStatus(session, plan) === 'reported-pass',
        'Complete software ledger did not pass',
      );
      const changed = lib
        .demoInventory()
        .map((item) => (item.id === 'arm' ? { ...item, available: false } : item));
      const newPlan = lib.planRecipe(plan.recipe, changed);
      check(
        lib.buildStatus(session, newPlan) === 'stale',
        'Changed inventory reused prior evidence',
      );
      await rejects(
        () => lib.attachImage(session, newPlan, jpeg.artifact, jpeg.blob),
        /plan changed/,
      );
      await reopened.remove(original.artifact.id);
      check((await reopened.get(original.artifact.id)) === undefined, 'Explicit delete failed');
      reopened.close();
      const stopping = lib.captureSequence(camera, binding, {
        id: 'stop-sequence',
        count: 2,
        intervalMs: 60000,
      });
      await stopping.next();
      const stoppingPending = stopping.next();
      camera.stop();
      await rejects(() => stoppingPending, /camera ended/);
      check(!camera.active && camera.video.srcObject === null, 'Camera tracks survived stop');
      await rejects(() => camera.capture(binding), /no live frame/);
      // An external disconnection also makes capture fail, without an implicit reopen.
      const disconnected = await lib.CameraSession.open();
      const disconnectedStream = disconnected.video.srcObject as MediaStream;
      disconnectedStream.getTracks().forEach((track) => track.stop());
      check(!disconnected.active, 'An ended track was reported live');
      await rejects(() => disconnected.capture(binding), /no live frame/);
      disconnected.stop();
      const stalled = await lib.CameraSession.open();
      // Simulate a browser source whose previously-ready video stops delivering callbacks.
      stalled.video.requestVideoFrameCallback = () => 0;
      await rejects(() => stalled.capture(binding), /did not produce a frame/);
      check(!stalled.active && stalled.video.srcObject === null, 'Stalled camera was not released');
      // Simulate denial and a late permission grant. No real device is involved.
      const nativeGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException('Denied by synthetic test', 'NotAllowedError');
      };
      await rejects(() => lib.CameraSession.open(), /Denied/);
      const deniedTrial = await lib.runCameraTrial(trialItem, { context: 'synthetic-test' });
      check(
        deniedTrial.trial.outcome === 'failed' && !deniedTrial.image,
        'Denied trial created passing evidence',
      );
      const canvas = document.createElement('canvas');
      canvas.width = 8;
      canvas.height = 8;
      const lateStream = canvas.captureStream(5);
      navigator.mediaDevices.getUserMedia = () =>
        new Promise((resolve) => setTimeout(() => resolve(lateStream), 200));
      await rejects(() => lib.CameraSession.open({ timeoutMs: 100 }), /timed out/);
      await new Promise((resolve) => setTimeout(resolve, 200));
      check(
        lateStream.getTracks().every((track) => track.readyState === 'ended'),
        'Late permission stream leaked',
      );
      // A stream without frames must also be released when startup times out.
      const blank = new MediaStream();
      navigator.mediaDevices.getUserMedia = async () => blank;
      await rejects(() => lib.CameraSession.open({ timeoutMs: 100 }), /did not produce a frame/);
      navigator.mediaDevices.getUserMedia = nativeGetUserMedia;
      return {
        width,
        height,
        correctedBytes: corrected.blob.size,
        bundledImages: restoredBundle.images.length,
        sequenceFrames: sequenceSummary.frameCount,
        actualIntervalsMs: sequenceSummary.intervalsMs,
        deviceTrial: probe.trial.outcome,
        deviceTrialContext: probe.trial.context,
        inventoryPhotoContext: photoObservation.scan.context,
        inventoryPhotoProposals: photoObservation.scan.proposals.length,
        visionResponseSource: 'synthetic-protocol-fixture',
        provenance: 'synthetic-browser-camera',
      };
    });
    assert.deepEqual(errors, []);
    console.log(
      'PASS: synthetic Chromium capture, timed sequences, device trials, photo inventory protocol, correction, local evidence, denial and cleanup.',
    );
    console.log(JSON.stringify(result));
  } finally {
    await browser.close();
  }
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
