import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { createApi } from './api.js';
import { conceptFixture } from '../tests/ideation-fixture.js';
import { photoObservationFixture } from '../tests/inventory-scan-fixture.js';
import type { Server } from 'node:http';

// Exercise the actual interface with explicitly synthetic camera and model output.
// This does not access a physical sensor, private inventory, or a live model.
const servers: Server[] = [];
async function serve(ai = false) {
  let calls = 0;
  const server = createApi(
    ai
      ? {
          baseUrl: 'http://127.0.0.1:1/v1',
          model: 'synthetic-protocol',
          visionModel: 'synthetic-vision',
        }
      : undefined,
    async (_url, init) => {
      calls++;
      const input = JSON.parse(String(init?.body));
      const value =
        input.model === 'synthetic-vision'
          ? photoObservationFixture()
          : input.response_format.json_schema.name.includes('critic')
            ? { issues: [] }
            : input.messages[0].content.includes('resource reviewer')
              ? { issues: [] }
              : { concepts: [conceptFixture()] };
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }),
      );
    },
    { webDirectory: resolve(import.meta.dirname, '../web') },
  );
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  return { url: `http://127.0.0.1:${address.port}`, calls: () => calls };
}
const browser = await chromium.launch({
  ...(process.env.SCRAPMIND_CHROME_EXECUTABLE
    ? { executablePath: process.env.SCRAPMIND_CHROME_EXECUTABLE }
    : {}),
  headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
try {
  const offline = await serve();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) =>
    route.request().url().startsWith(offline.url) ? route.continue() : route.abort(),
  );
  await page.goto(offline.url);
  await page
    .getByRole('button', { name: 'AI model settings' })
    .filter({ hasText: 'connect a model' })
    .waitFor();
  await page.getByRole('button', { name: 'Remove a part' }).click();
  await page.getByRole('status').filter({ hasText: 'now uses' }).waitFor();
  assert.equal(await page.getByLabel('Adjustable desk arm available').isChecked(), false);
  await page.getByRole('button', { name: 'Start build', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).first().click();
  await page.getByText('Saved in this browser.', { exact: true }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Undo', exact: true }).first().waitFor();
  assert.equal(await page.getByLabel('Adjustable desk arm available').isChecked(), false);
  await page.getByRole('button', { name: 'Camera Lab', exact: true }).first().click();
  await page.getByRole('button', { name: 'Open camera', exact: true }).click();
  await page.getByText('Camera open. Preview stays on this device.', { exact: true }).waitFor();
  await page
    .getByLabel(
      'I confirm this camera or imported image source represents the selected inventory device.',
    )
    .check();
  await page.getByRole('button', { name: 'Capture frame', exact: true }).click();
  await page.getByText('Original frame attached to this build.', { exact: true }).waitFor();
  await page.getByRole('img', { name: 'Build evidence image 1', exact: true }).waitFor();
  const imageDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).first().click();
  const standaloneImage = await imageDownload;
  const standalonePath = await standaloneImage.path();
  assert(standalonePath);
  const standaloneHash = createHash('sha256')
    .update(await readFile(standalonePath))
    .digest('hex');
  await page.getByText('Image downloaded with its saved pixels.', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Correct perspective', exact: true }).first().click();
  await page.getByLabel('Output width').fill('160');
  await page.getByLabel('Output height').fill('120');
  await page.getByRole('button', { name: 'Save corrected image', exact: true }).click();
  await page
    .getByText('Corrected image saved with its parent original.', { exact: false })
    .waitFor();
  await page.getByRole('img', { name: 'Build evidence image 2', exact: true }).waitFor();
  await page.getByLabel('Frames', { exact: true }).fill('3');
  await page.getByLabel('Interval (ms)', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Capture sequence', exact: true }).click();
  await page.getByText('3 originals saved across', { exact: false }).waitFor();
  await page.getByRole('img', { name: 'Build evidence image 5', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Close camera', exact: true }).click();
  await page.getByRole('button', { name: 'Open camera', exact: true }).waitFor();
  await page.getByLabel('Inventory device', { exact: true }).selectOption('webcam');
  await page.getByRole('button', { name: 'Run frame trial', exact: true }).click();
  await page.getByText('Frame trial saved.', { exact: false }).waitFor();
  await page
    .getByRole('img', { name: 'Camera frame from this device trial', exact: true })
    .waitFor();
  await page.getByLabel('I confirm this frame came from this physical inventory device.').check();
  await page.getByRole('button', { name: 'Apply camera result', exact: true }).click();
  await page
    .getByText('Only the camera frame function is recorded as tested.', { exact: false })
    .waitFor();
  await page.getByRole('button', { name: 'Evidence', exact: true }).click();
  const bundleDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export with photos', exact: true }).last().click();
  const download = await bundleDownload;
  assert.equal(download.suggestedFilename(), 'scrapmind-evidence-bundle.json');
  await page.getByText('Full bundle downloaded.', { exact: false }).waitFor();
  const downloadedPath = await download.path();
  assert(downloadedPath);
  const downloadedBytes = await readFile(downloadedPath);
  const exported = JSON.parse(downloadedBytes.toString('utf8'));
  assert.equal(exported.images.length, 6);
  assert.equal(standaloneHash, exported.workspace.builds[0].artifacts[0].sha256);
  assert.equal(
    exported.workspace.builds[0].artifacts[1].parentId,
    exported.workspace.builds[0].artifacts[0].id,
  );
  assert.deepEqual(
    exported.workspace.inventory.find((item: { id: string }) => item.id === 'webcam')
      .testedCapabilities,
    ['camera'],
  );
  await page.getByLabel('Restore workspace', { exact: true }).setInputFiles({
    name: 'synthetic-ui-bundle.json',
    mimeType: 'application/json',
    buffer: downloadedBytes,
  });
  await page.getByText('Workspace restored.', { exact: false }).waitFor();
  // A second tab must not silently overwrite this tab's saved workspace.
  const second = await page.context().newPage();
  await second.goto(offline.url);
  await second
    .getByRole('button', { name: 'AI model settings' })
    .filter({ hasText: 'connect a model' })
    .waitFor();
  await second.getByLabel('Desk lamp available').uncheck();
  await second.getByText('Saved in this browser.', { exact: true }).waitFor();
  await page.getByLabel('USB webcam available').click();
  await page.getByRole('alert').filter({ hasText: 'Another tab changed this workspace' }).waitFor();
  assert.equal(await page.getByLabel('USB webcam available').isChecked(), true);
  const recoveryDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download unsaved work', exact: true }).click();
  const recovery = await recoveryDownload;
  assert.equal(recovery.suggestedFilename(), 'scrapmind-unsaved-recovery-bundle.json');
  const recoveryPath = await recovery.path();
  assert(recoveryPath);
  const recovered = JSON.parse(await readFile(recoveryPath, 'utf8'));
  assert.equal(
    recovered.workspace.inventory.find((item: { id: string }) => item.id === 'webcam').available,
    false,
  );
  assert.equal(recovered.images.length, 6);
  await page.getByText('Unsaved work downloaded as a full bundle.', { exact: false }).waitFor();
  await page.reload();
  await page
    .getByRole('button', { name: 'AI model settings' })
    .filter({ hasText: 'connect a model' })
    .waitFor();
  await page.getByRole('button', { name: 'Evidence', exact: true }).click();
  await page.getByText('stale', { exact: true }).waitFor();
  // Imported names must be text, never executable markup.
  await page.getByRole('button', { name: 'Add a part', exact: true }).click();
  await page
    .getByLabel('Name', { exact: true })
    .fill('<img src=x onerror="window.scrapmindXss=1">');
  await page.getByRole('button', { name: 'Save part', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(
    await page.getByLabel('Name', { exact: true }).inputValue(),
    '<img src=x onerror="window.scrapmindXss=1">',
  );
  await page.getByLabel('light', { exact: true }).check();
  await page.getByRole('button', { name: 'Save part', exact: true }).click();
  await page.getByText('Saved in this browser.', { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() =>
      Boolean((window as unknown as { scrapmindXss?: number }).scrapmindXss),
    ),
    false,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Workbench', exact: true }).click();
  const overflow = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    elements: Array.from(document.querySelectorAll('*'))
      .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
      .map((element) => ({
        tag: element.tagName,
        class: element.className,
        text: element.textContent?.slice(0, 80),
        right: element.getBoundingClientRect().right,
      }))
      .slice(0, 20),
  }));
  if (overflow.page > overflow.viewport) {
    await page.screenshot({ path: '/tmp/scrapmind-mobile-overflow.png', fullPage: true });
    throw new Error(JSON.stringify(overflow));
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.screenshot({
    path: process.env.SCRAPMIND_WEB_SCREENSHOT ?? '/tmp/scrapmind-workbench-mobile.png',
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await second.close();
  await page.close();
  const ai = await serve(true);
  const aiPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  aiPage.setDefaultTimeout(10000);
  const aiErrors: string[] = [];
  aiPage.on('pageerror', (error) => aiErrors.push(error.message));
  await aiPage.goto(ai.url);
  await aiPage
    .getByRole('button', { name: 'AI model settings' })
    .filter({ hasText: 'synthetic-protocol' })
    .waitFor();
  assert.equal(ai.calls(), 0);
  await aiPage
    .getByLabel('Your goal', { exact: true })
    .fill('Use the camera and lamp to compare a panel.');
  await aiPage.getByLabel('Ideas', { exact: true }).selectOption('1');
  await aiPage.getByRole('button', { name: 'Invent with AI', exact: true }).click();
  await aiPage.getByText('draft idea(s) saved.', { exact: false }).waitFor({ timeout: 10000 });
  assert.equal(ai.calls(), 2);
  await aiPage.getByLabel('I reviewed the procedure and physical roles.').check();
  await aiPage.getByRole('button', { name: 'Mark reviewed', exact: true }).click();
  await aiPage.getByText('Draft review recorded.', { exact: false }).waitFor();
  assert.equal(
    await aiPage.getByRole('button', { name: 'Start build', exact: true }).isEnabled(),
    true,
  );
  await aiPage.getByRole('button', { name: 'Evidence', exact: true }).click();
  const photo = await aiPage.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 60;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'green';
    ctx.fillRect(0, 0, 80, 60);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await aiPage.getByLabel('Choose workshop photo', { exact: true }).setInputFiles({
    name: 'synthetic-workshop.png',
    mimeType: 'image/png',
    buffer: Buffer.from(photo, 'base64'),
  });
  assert.equal(ai.calls(), 2);
  await aiPage.getByRole('button', { name: 'Suggest inventory from photo', exact: true }).click();
  await aiPage.getByText('Photo suggestions saved.', { exact: false }).waitFor();
  assert.equal(ai.calls(), 3);
  await aiPage.getByRole('button', { name: 'Review declaration', exact: true }).first().click();
  await aiPage
    .getByLabel('Owner review note', { exact: true })
    .fill('Synthetic UI owner-confirmation simulation, not physical recognition validation.');
  await aiPage
    .getByLabel(
      'I confirm identity, count, functions, and any entered measurements from the actual object.',
    )
    .check();
  await aiPage.getByRole('button', { name: 'Save decision', exact: true }).click();
  await aiPage.getByText('Owner decision saved.', { exact: false }).waitFor();
  await aiPage.getByText('added', { exact: true }).waitFor();
  assert.deepEqual(aiErrors, []);
  await aiPage.close();
  const denied = await browser.newPage();
  denied.setDefaultTimeout(10000);
  await denied.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Synthetic permission denial.', 'NotAllowedError');
    };
  });
  await denied.goto(offline.url);
  await denied
    .getByRole('button', { name: 'AI model settings' })
    .filter({ hasText: 'connect a model' })
    .waitFor();
  await denied.getByRole('button', { name: 'Camera Lab', exact: true }).first().click();
  await denied.getByRole('button', { name: 'Open camera', exact: true }).click();
  await denied.getByRole('alert').filter({ hasText: 'Synthetic permission denial' }).waitFor();
  assert.equal(
    await denied.getByRole('button', { name: 'Open camera', exact: true }).isEnabled(),
    true,
  );
  await denied.close();
  console.log(
    JSON.stringify(
      {
        interface: 'actual Chromium',
        camera: 'synthetic',
        model: 'synthetic-protocol',
        checked: [
          'replanning',
          'saved build progress',
          'reload',
          'camera capture',
          'perspective lineage',
          'bundle export',
          'concurrent-tab refusal',
          'stale status',
          'escaped names',
          'mobile width',
          'reduced motion',
          'explicit AI generation',
          'draft review',
          'photo input',
          'owner declaration',
          'form recovery',
          'timed capture',
          'frame trial',
          'bundle restore',
          'save-conflict recovery',
          'permission-denial recovery',
          'standalone image download',
        ],
        physicalValidation: 'not-performed',
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
          server.closeAllConnections();
        }),
    ),
  );
}
