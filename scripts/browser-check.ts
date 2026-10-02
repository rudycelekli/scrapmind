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
      const workspace = {
        format: 'scrapmind-workspace' as const,
        version: 1 as const,
        name: 'Synthetic browser check',
        inventory: lib.demoInventory(),
        recipes: [],
        builds: [session],
        exportedAt: new Date().toISOString(),
      };
      const bundleJson = await lib.exportEvidenceBundle(workspace, (id) => reopened.get(id));
      const restoredBundle = await lib.importEvidenceBundle(bundleJson);
      check(restoredBundle.images.length === 2, 'Bundle lost image evidence');
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
      camera.stop();
      check(!camera.active && camera.video.srcObject === null, 'Camera tracks survived stop');
      await rejects(() => camera.capture(binding), /no live frame/);
      // An external disconnection also makes capture fail, without an implicit reopen.
      const disconnected = await lib.CameraSession.open();
      const disconnectedStream = disconnected.video.srcObject as MediaStream;
      disconnectedStream.getTracks().forEach((track) => track.stop());
      check(!disconnected.active, 'An ended track was reported live');
      await rejects(() => disconnected.capture(binding), /no live frame/);
      disconnected.stop();
      // Simulate denial and a late permission grant. No real device is involved.
      const nativeGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException('Denied by synthetic test', 'NotAllowedError');
      };
      await rejects(() => lib.CameraSession.open(), /Denied/);
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
        provenance: 'synthetic-browser-camera',
      };
    });
    assert.deepEqual(errors, []);
    console.log(
      'PASS: synthetic Chromium camera, perspective correction, image storage, build evidence, denial and cleanup.',
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
