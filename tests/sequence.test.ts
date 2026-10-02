import { afterEach, expect, it, vi } from 'vitest';
import type { CameraSession, CapturedImage } from '../core/camera.js';
import { createImageArtifact } from '../core/evidence.js';
import { captureSequence, describeSequence } from '../core/sequence.js';
import { pngBlob } from './image-fixture.js';

const binding = {
  buildId: 'build',
  itemId: 'camera',
  inventoryFingerprint: 'inventory',
  recipeFingerprint: 'recipe',
};
function fakeCamera(delayMs = 0) {
  const started: number[] = [];
  let concurrent = 0,
    maxConcurrent = 0;
  const camera = {
    active: true,
    capture: vi.fn(
      async (
        ...[imageBinding, , clock]: Parameters<CameraSession['capture']>
      ): Promise<CapturedImage> => {
        started.push(performance.now());
        maxConcurrent = Math.max(maxConcurrent, ++concurrent);
        const capturedAt = new Date().toISOString();
        const elapsedMs = performance.now() - clock!.originMs;
        if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
        const blob = pngBlob();
        const artifact = await createImageArtifact(
          blob,
          imageBinding,
          'browser-capture',
          capturedAt,
          undefined,
          {
            sequenceId: clock!.sequenceId,
            frameIndex: clock!.frameIndex,
            targetElapsedMs: clock!.targetElapsedMs,
            elapsedMs,
          },
        );
        concurrent--;
        return { artifact, blob };
      },
    ),
  };
  return { camera, started, maximumConcurrency: () => maxConcurrent };
}
afterEach(() => vi.useRealTimers());
function fakeTime() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
}

it('captures ordered frames, measures actual intervals, and never overlaps encoders', async () => {
  fakeTime();
  const source = fakeCamera(250);
  const sequence = captureSequence(source.camera, binding, {
    id: 'sequence',
    count: 3,
    intervalMs: 100,
  });
  const images: CapturedImage[] = [];
  for (let index = 0; index < 3; index++) {
    const pending = sequence.next();
    await vi.runAllTimersAsync();
    images.push((await pending).value!);
  }
  expect((await sequence.next()).done).toBe(true);
  expect(source.started).toEqual([0, 300, 600]);
  expect(source.maximumConcurrency()).toBe(1);
  expect(new Set(images.map((image) => image.artifact.id)).size).toBe(3);
  expect(describeSequence(images)).toMatchObject({
    frameCount: 3,
    elapsedMs: 600,
    intervalsMs: [300, 300],
  });
  expect(vi.getTimerCount()).toBe(0);
});

it('cancels a waiting sequence immediately and removes its scheduled timer', async () => {
  fakeTime();
  const source = fakeCamera();
  const controller = new AbortController();
  const sequence = captureSequence(
    source.camera,
    binding,
    { id: 'cancel', count: 2, intervalMs: 1000 },
    controller.signal,
  );
  const first = sequence.next();
  await vi.runAllTimersAsync();
  await first;
  const pending = sequence.next();
  const assertion = expect(pending).rejects.toThrow('cancelled');
  controller.abort();
  await assertion;
  expect(source.camera.capture).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('discards an in-flight result after cancellation without implicitly closing the preview', async () => {
  fakeTime();
  const source = fakeCamera(250);
  const controller = new AbortController();
  const sequence = captureSequence(
    source.camera,
    binding,
    { id: 'cancel-in-flight', count: 2, intervalMs: 100 },
    controller.signal,
  );
  const pending = sequence.next();
  const assertion = expect(pending).rejects.toThrow('cancelled');
  await vi.advanceTimersByTimeAsync(20);
  controller.abort();
  await vi.runAllTimersAsync();
  await assertion;
  expect(source.camera.active).toBe(true);
  expect(source.camera.capture).toHaveBeenCalledTimes(1);
});

it('responds immediately to a camera ending while waiting', async () => {
  fakeTime();
  const source = fakeCamera();
  const ended = new AbortController();
  const camera = Object.assign(source.camera, { endedSignal: ended.signal });
  const sequence = captureSequence(camera, binding, { id: 'ended', count: 2, intervalMs: 60000 });
  const first = sequence.next();
  await vi.runAllTimersAsync();
  await first;
  const pending = sequence.next();
  const assertion = expect(pending).rejects.toThrow('camera ended');
  camera.active = false;
  ended.abort();
  await assertion;
  expect(vi.getTimerCount()).toBe(0);
});

it('rejects invalid schedules and an already cancelled request before capture', async () => {
  const source = fakeCamera();
  await expect(
    captureSequence(source.camera, binding, { id: 'invalid', count: 1, intervalMs: 100 }).next(),
  ).rejects.toThrow();
  await expect(
    captureSequence(source.camera, binding, {
      id: 'invalid',
      count: 2,
      intervalMs: Infinity,
    }).next(),
  ).rejects.toThrow();
  const controller = new AbortController();
  controller.abort();
  await expect(
    captureSequence(
      source.camera,
      binding,
      { id: 'cancelled', count: 2, intervalMs: 100 },
      controller.signal,
    ).next(),
  ).rejects.toThrow('cancelled');
  expect(source.camera.capture).not.toHaveBeenCalled();
});

it('rejects incoherent sequence summaries instead of comparing unrelated clocks', async () => {
  fakeTime();
  const source = fakeCamera();
  const sequence = captureSequence(source.camera, binding, {
    id: 'ordered',
    count: 2,
    intervalMs: 100,
  });
  const first = sequence.next();
  await vi.runAllTimersAsync();
  const one = (await first).value!;
  const second = sequence.next();
  await vi.runAllTimersAsync();
  const two = (await second).value!;
  expect(() => describeSequence([two, one])).toThrow('ordered originals');
  expect(() =>
    describeSequence([one, { ...two, artifact: { ...two.artifact, itemId: 'another' } }]),
  ).toThrow('ordered originals');
  expect(() =>
    describeSequence([one, { ...two, artifact: { ...two.artifact, timing: undefined } }]),
  ).toThrow('ordered originals');
});
