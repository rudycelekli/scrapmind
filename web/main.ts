import {
  BrowserWorkspaceStore,
  ImageStore,
  createWorkbench,
  workbenchCatalog,
  updateWorkbenchInventory,
  setWorkbenchAvailability,
  startWorkbenchBuild,
  completeWorkbenchStep,
  recordWorkbenchCheck,
  attachWorkbenchImage,
  reviewWorkbenchRecipe,
  saveWorkbenchIdeas,
  discoverPlans,
  describeReplan,
  planRecipe,
  itemSchema,
  capabilities,
  buildStatus,
  CameraSession,
  importImage,
  correctPerspective,
  captureSequence,
  describeSequence,
  runCameraTrial,
  applyCameraTrial,
  deviceTrialIsCurrent,
  deviceTrialSchema,
  exportEvidenceBundle,
  importEvidenceBundle,
  importWorkspace,
  exportWorkspace,
  reportWorkbench,
  renderWorkbenchReport,
  workspaceSchema,
  photoDataUrl,
  inventoryScanSchema,
  saveWorkbenchScan,
  reviewWorkbenchScan,
  inventoryFingerprint,
  type Workspace,
  type Plan,
  type InventoryItem,
  type CapturedImage,
  type ImageBinding,
  type IdeationResult,
  type Quad,
} from '../core/index.js';
import { demoInventory } from '../core/fixtures.js';
import { escape as e, icon, roleMap } from './visual.js';

type View = 'bench' | 'camera' | 'evidence';
type ModelStatus = {
  enabled: boolean;
  name?: string;
  mode?: string;
  vision?: { configured: boolean; name?: string };
};
const root = document.querySelector<HTMLDivElement>('#app')!;
let workspace = createWorkbench('Demo workbench', demoInventory());
let store: BrowserWorkspaceStore | undefined;
let images: ImageStore | undefined;
let revision = 0;
let recoveryWorkspace: Workspace | undefined;
let focusAnchor: string | undefined;
let view: View = 'bench';
let selected = 'document-scanner';
let selectedBuild = '';
let goal = '';
let count = 3;
let model: ModelStatus = { enabled: false };
let modelLoaded = false;
let busy = false;
let message = '';
let messageKind: 'success' | 'error' | 'progress' = 'success';
let editing: string | undefined;
let settingsOpen = false;
let inventoryOpen = false;
let resetPending = false;
let changes: string[] = [];
let camera: CameraSession | undefined;
let openingCamera = false;
let cameraGeneration = 0;
let browserDevice = '';
let devices: MediaDeviceInfo[] = [];
let bindingItem = '';
let sourceConfirmed = false;
let sequenceAbort: AbortController | undefined;
let modelAbort: AbortController | undefined;
let galleryUrls: string[] = [];
let evidenceUrls: string[] = [];
let crop: { image: CapturedImage; corners: Quad; url: string } | undefined;
let scanPhoto: File | undefined;
let reviewCandidate: { scanId: string; proposalId: string } | undefined;
const formDrafts = new Map<string, { name: string; value: string; checked?: boolean }[]>();
const discardedDrafts = new Set<string>();
function forgetDraft(key: string): void {
  formDrafts.delete(key);
  discardedDrafts.add(key);
}

function currentPlan(): Plan {
  const catalog = workbenchCatalog(workspace);
  return planRecipe(
    catalog.find((recipe) => recipe.id === selected) ?? catalog[0],
    workspace.inventory,
  );
}
function currentBuild() {
  const builds = workspace.builds.filter((build) => build.recipeId === currentPlan().recipe.id);
  return builds.find((build) => build.id === selectedBuild) ?? builds[builds.length - 1];
}
function stale(): boolean {
  const build = currentBuild();
  return Boolean(build && buildStatus(build, currentPlan()) === 'stale');
}
function disable(condition = false): string {
  return busy || condition ? 'disabled' : '';
}
function button(
  label: string,
  action: string,
  options: { id?: string; primary?: boolean; off?: boolean; icon?: string; small?: boolean } = {},
): string {
  return `<button type="button" class="button${options.primary ? ' primary' : ''}${options.small ? ' small' : ''}" data-action="${action}"${options.id ? ` data-id="${e(options.id)}"` : ''} ${disable(options.off)}>${options.icon ? icon(options.icon) : ''}${e(label)}</button>`;
}
function tag(label: string, kind = ''): string {
  return `<span class="tag ${kind}">${e(label)}</span>`;
}
function fileInput(label: string, id: string, accept: string, off = false): string {
  return `<label class="file-label${busy || off ? ' disabled' : ''}">${icon('plus')}${e(label)}<input id="${id}" type="file" accept="${accept}" ${disable(off)} aria-label="${e(label)}" /></label>`;
}
function notice(): string {
  return message
    ? `<div class="notice ${messageKind}" ${messageKind === 'error' ? 'role="alert"' : 'role="status"'}>${messageKind === 'progress' ? '<span class="progress-mark" aria-hidden="true"></span>' : ''}<div class="notice-body">${e(message)}</div>${recoveryWorkspace && !busy ? '<button class="button small" data-action="export-recovery">Download unsaved work</button>' : ''}${modelAbort ? '<button class="button small" data-action="cancel-model">Stop request</button>' : !busy ? '<button class="button quiet" aria-label="Dismiss notice" data-action="dismiss">' + icon('close') + '</button>' : ''}</div>`
    : '';
}
function capabilitiesForm(selectedCapabilities: readonly string[]): string {
  return `<fieldset><legend>Declared functions</legend><div class="cap-options">${capabilities.map((cap) => `<label><input type="checkbox" name="capabilities" value="${cap}" ${selectedCapabilities.includes(cap) ? 'checked' : ''}/>${cap}</label>`).join('')}</div></fieldset>`;
}
function itemFields(item?: Partial<InventoryItem>): string {
  return `<label>Name<input name="name" maxlength="100" required value="${e(item?.name)}" /></label>
    <div class="form-row"><label>Kind<select name="kind">${['device', 'material', 'tool'].map((kind) => `<option ${item?.kind === kind ? 'selected' : ''}>${kind}</option>`).join('')}</select></label><label>Quantity<input name="quantity" type="number" min="1" max="10000" step="1" value="${item?.quantity ?? 1}" required /></label></div>
    ${capabilitiesForm(item?.capabilities ?? [])}
    <fieldset><legend>Measured dimensions (mm, optional)</legend><div class="form-row">${(['length', 'width', 'height'] as const).map((key) => `<label>${key}<input name="${key}" type="number" min="0.01" max="100000" step="any" value="${item?.dimensions?.[key] ?? ''}" /></label>`).join('')}</div></fieldset>
    <label>Notes<textarea name="notes" maxlength="2000" rows="2">${e(item?.notes)}</textarea></label>`;
}
function editor(): string {
  if (editing === undefined) return '';
  const item = workspace.inventory.find((entry) => entry.id === editing);
  return `<form id="item-form" data-draft-key="item-${e(editing)}" class="edit-panel"><h3>${item ? 'Edit your part' : 'Declare a part'}</h3>${itemFields(item)}<p class="small muted">Saving declares the functions you select. Existing tested claims are cleared when the configuration changes.</p><div class="edit-actions"><button class="button primary small" ${disable()}>Save part</button>${button('Cancel', 'cancel-edit', { small: true })}${item ? button('Remove', 'delete-item', { id: item.id, small: true }) : ''}</div></form>`;
}
function inventory(): string {
  const groups = ['device', 'material', 'tool'] as const;
  return `<aside id="inventory" class="inventory${inventoryOpen ? ' open' : ''}" aria-label="Your inventory"><div class="inventory-head"><h2>Your parts <span class="muted small">${workspace.inventory.length}</span></h2>${button('Add', 'add-item', { icon: 'plus', small: true })}</div><p class="inventory-note">${workspace.name === 'Demo workbench' ? 'Demo declarations. Replace these examples with your actual parts.' : 'Owner declarations. Availability changes replan your configurations.'}</p><div class="workspace-name">${e(workspace.name)} · ${store ? (revision ? 'saved locally' : 'unsaved examples') : 'temporary session'}</div>${editor()}${groups
    .map((kind) => {
      const items = workspace.inventory.filter((item) => item.kind === kind);
      return items.length
        ? `<div class="inventory-group">${kind === 'device' ? 'Spare devices' : kind === 'material' ? 'Materials' : 'Tools'}</div>${items.map((item) => `<div class="item-row${item.available ? '' : ' unavailable'}"><input type="checkbox" data-availability="${e(item.id)}" id="available-${e(item.id)}" ${item.available ? 'checked' : ''} ${disable()} aria-label="${e(item.name)} available" /><label for="available-${e(item.id)}"><div class="item-name">${e(item.name)}</div><div class="item-meta">${item.quantity} ${item.quantity === 1 ? 'unit' : 'units'} · ${e(item.capabilities.slice(0, 2).join(' / '))}</div></label><button class="edit-item" data-action="edit-item" data-id="${e(item.id)}" aria-label="Edit ${e(item.name)}" ${disable()}>···</button></div>`).join('')}`
        : '';
    })
    .join(
      '',
    )}<div class="inventory-footer">${button('Add a part', 'add-item', { icon: 'plus', small: true })}${button('Start with my own parts', 'reset-prompt', { small: true })}${fileInput('Import workspace', 'workspace-import', '.json')}${button('Export with photos', 'export-bundle', { icon: 'download', small: true })}<p class="inventory-note">Stored in this browser, at this address. Import replaces the current workspace; export first to keep its history.</p></div></aside>`;
}
function settings(): string {
  if (!settingsOpen) return '';
  return `<section class="settings" aria-labelledby="ai-settings-title"><div class="section-head"><h2 id="ai-settings-title">Connect your invention engine</h2>${button('Close', 'settings', { small: true })}</div><p>${model.enabled ? `Using ${e(model.name)} through a ${e(model.mode)} provider. Inventory and goals are sent only when you request AI ideas.` : 'Configure a model on the local server, then restart it. Planning, builds, camera capture, and evidence work without AI.'}</p><p>Copy <code>.env.example</code> to <code>.env</code> in the project. For an installed Ollama model:</p><pre>SCRAPMIND_AI_BASE_URL=http://127.0.0.1:11434/v1\nSCRAPMIND_AI_MODEL=your-installed-model</pre><p>You can also configure a remote OpenAI-compatible endpoint and a separate critic. Keep keys on the server. A vision model is optional for photo inventory suggestions.</p><a href="https://github.com/rudycelekli/scrapmind/blob/main/docs/AI.md" target="_blank" rel="noopener noreferrer">Provider setup and tested limits ↗</a></section>`;
}
function resetPrompt(): string {
  return resetPending
    ? `<div class="notice"><div class="notice-body"><strong>Start an empty workbench?</strong><p>Your current workspace will be replaced in this browser. Export it first to retain builds and their photos.</p><div class="actions">${button('Export with photos', 'export-bundle', { small: true })}${button('Start empty', 'reset-empty', { small: true })}${button('Keep working', 'reset-cancel', { small: true })}</div></div></div>`
    : '';
}
function ideaRows(plans: Plan[]): string {
  const plan = currentPlan();
  return plans
    .map(
      (entry, index) =>
        `<button class="idea-row" data-action="select-plan" data-id="${e(entry.recipe.id)}" aria-pressed="${entry.recipe.id === plan.recipe.id}" ${disable()}><span class="idea-num">${String(index + 1).padStart(2, '0')}</span><span class="idea-text"><strong>${e(entry.recipe.title)}</strong><span>${entry.recipe.source === 'generated' ? 'AI draft' : entry.recipe.category === 'alchemy' ? 'DEVICE ALCHEMY' : 'FABRICATION'} · ${entry.coveredUnits}/${entry.totalUnits} units</span></span>${icon('arrow')}</button>`,
    )
    .join('');
}
function bench(): string {
  const plan = currentPlan();
  const build = currentBuild();
  const plans = discoverPlans(workspace.inventory, goal, workbenchCatalog(workspace));
  const removable =
    plan.allocations.find((allocation) => allocation.requirementId === 'support') ??
    plan.allocations.find((allocation) => !allocation.matchedCapabilities.includes('camera'));
  const roleStatus =
    plan.status === 'draft'
      ? 'Unreviewed draft'
      : plan.missing.length
        ? 'Parts needed'
        : 'All roles matched';
  return `<div class="hero"><div><p class="eyebrow">Second-life lab / Invention workbench</p><h1 tabindex="-1">What can this become?</h1><p>Give the things you have a useful new job.</p></div><div class="lab-stamp">SCRAPMIND LAB<br>LOCAL WORKSPACE<br>ENGINEERING ALPHA</div></div>${settings()}${resetPrompt()}${notice()}
    <form id="goal-form" class="goal-form"><label>Your goal<input id="goal" name="goal" placeholder="e.g. scan documents with my spare camera" value="${e(goal)}" maxlength="1000" ${disable()} /></label><label>Ideas<select name="count" id="idea-count" aria-label="Ideas" ${disable()}>${[1, 2, 3].map((n) => `<option value="${n}" ${count === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label><button class="button primary" ${disable(!modelLoaded)}>${icon('spark')}${model.enabled ? 'Invent with AI' : 'Connect AI'}</button></form>
    <p class="provider-note">${model.enabled ? `Explicit request to ${e(model.name)} (${e(model.mode)}). Your inventory and goal are supplied to generation and critique. Ideas remain drafts.` : 'Explore the starter procedures now. Connect a model to generate and critique new ideas.'} ${model.enabled ? '<button data-action="settings">Model settings</button>' : ''}</p>
    <div class="workbench-grid"><div class="configuration"><div class="plan-heading"><div><p class="eyebrow">${plan.recipe.source === 'generated' ? 'AI proposal' : plan.recipe.category === 'alchemy' ? 'Device Alchemy / starter procedure' : 'Fabrication / starter procedure'}</p><h2>${e(plan.recipe.title)}</h2><p>${e(plan.recipe.subtitle)}</p></div>${tag(roleStatus, plan.status === 'ready' ? '' : 'warn')}</div>
    <div class="map-panel"><div class="map-toolbar"><span>CONFIGURATION / ${String(workbenchCatalog(workspace).findIndex((recipe) => recipe.id === plan.recipe.id) + 1).padStart(2, '0')}</span><span>${plan.coveredUnits}/${plan.totalUnits} UNITS ASSIGNED</span></div><div class="map-scroll" tabindex="0" role="region" aria-label="Configuration role map, scroll horizontally on small screens">${roleMap(plan, workspace.inventory)}</div><div class="map-caption"><span>Allocation map, inspect fit before building</span><span>${plan.recipe.minutes} MIN · ${e(plan.recipe.difficulty).toUpperCase()}</span></div></div>
    <div class="challenge"><p><strong>Try the remove-a-part challenge.</strong><br>Watch the assignments change when a part disappears.</p>${button('Remove a part', 'challenge', { id: removable?.itemId, off: !removable, icon: 'arrow', small: true })}</div>${changes.length ? `<div class="change-list" role="status">${changes.map((change) => `<p>${e(change)}</p>`).join('')}</div>` : ''}
    <details><summary>Assigned parts and missing roles</summary><ul class="allocation-list">${plan.recipe.requirements
      .map(
        (requirement) =>
          `<li><strong>${e(requirement.label)}</strong><span>${e(
            plan.allocations
              .filter((a) => a.requirementId === requirement.id)
              .map(
                (a) =>
                  `${a.quantity} × ${workspace.inventory.find((i) => i.id === a.itemId)?.name ?? a.itemId}`,
              )
              .join(' + ') || 'No available part',
          )}${plan.missing.some((m) => m.requirement.id === requirement.id) ? ' · missing units' : ''}</span></li>`,
      )
      .join('')}</ul></details>
    ${plan.recipe.ai ? `<section class="section"><p class="eyebrow">Why this idea</p><p>${e(plan.recipe.ai.reasoning)}</p><h3>Proposed new use</h3><p>${e(plan.recipe.ai.newUse)}</p><p class="small muted">${e(plan.recipe.ai.model)} · ${e(plan.recipe.ai.mode)} · ${e(plan.recipe.ai.resourceReview.status)}</p><ul class="boundary-list">${plan.recipe.ai.resourceReview.issues.map((issue) => `<li>${e(issue.detail)}</li>`).join('')}${plan.recipe.ai.assumptionsToTest.map((assumption) => `<li>${e(assumption)}</li>`).join('')}</ul>${!plan.recipe.reviewed ? `<form id="review-form" class="review-box"><p>Read the procedure, declared parts, assumptions, and issues before reviewing this draft.</p><label><input name="reviewed" type="checkbox" required />I reviewed the procedure and physical roles.</label>${plan.recipe.ai.resourceReview.status !== 'no-issues-reported' ? '<label><input name="issues" type="checkbox" required />I read the unresolved or incomplete resource review.</label>' : ''}<button class="button small" ${disable()}>Mark reviewed</button></form>` : ''}</section>` : ''}
    <section class="section" id="build-section"><div class="section-head"><div><h2 tabindex="-1" id="build-title">Guided build</h2><p>${build ? e(buildStatus(build, plan)) + ' · progress is owner-reported' : 'Follow the procedure, then keep the evidence.'}</p></div>${button(build ? 'Start new build' : 'Start build', 'start-build', { primary: true, off: plan.status !== 'ready', icon: 'arrow' })}</div>
    ${
      build
        ? `<label class="sr-only" for="build-history">Build history</label><select class="build-history" id="build-history" ${disable()}>${workspace.builds
            .filter((entry) => entry.recipeId === plan.recipe.id)
            .map(
              (entry) =>
                `<option value="${e(entry.id)}" ${entry.id === build.id ? 'selected' : ''}>${e(new Date(entry.startedAt).toLocaleString())} · ${e(buildStatus(entry, plan))}</option>`,
            )
            .join('')}</select>`
        : ''
    }
    ${stale() ? '<div class="notice error">This build belongs to earlier inventory or recipe inputs. Keep its history; start a new build to record current results.</div>' : ''}
    ${plan.recipe.steps.map((step, index) => `<div class="step-row${build?.completedSteps.includes(step.id) ? ' done' : ''}"><span class="step-number">${build?.completedSteps.includes(step.id) ? icon('check') : String(index + 1).padStart(2, '0')}</span><div><h3>${e(step.title)}</h3><span class="step-parts">${e(step.requirements.flatMap((id) => plan.allocations.filter((a) => a.requirementId === id).map((a) => workspace.inventory.find((i) => i.id === a.itemId)?.name ?? a.itemId)).join(' + '))}</span><p>${e(step.instruction)}</p><p class="muted small">Look for: ${e(step.check)}</p></div>${button(build?.completedSteps.includes(step.id) ? 'Undo' : 'Done', 'step', { id: step.id, small: true, off: !build || stale() })}</div>`).join('')}
    <details><summary>Assumptions and limits</summary><ul class="boundary-list">${plan.recipe.boundaries.map((boundary) => `<li>${e(boundary)}</li>`).join('')}</ul></details></section>
    ${
      build
        ? `<section class="section"><div class="section-head"><div><h2>Acceptance checks</h2><p>Record what you observed. A passing statement does not certify physical success.</p></div>${button('Camera Lab', 'view-camera', { icon: 'camera', small: true })}</div>${plan.recipe.checks
            .map((check) => {
              const recorded = build.results.find((result) => result.checkId === check.id);
              return `<form class="check-form" data-draft-key="check-${e(build.id)}-${e(check.id)}" data-check="${e(check.id)}"><h3>${e(check.label)}</h3><p>${e(check.procedure)}</p>${check.evidenceKind === 'capture' ? `<p class="small">Requires ${check.minArtifacts ?? 1} original image(s)${check.minCaptureSpanMs ? ` across at least ${check.minCaptureSpanMs} ms` : ''}. Select attached evidence.</p>${build.artifacts.map((artifact, index) => `<label class="artifact-option"><input type="checkbox" name="artifacts" value="${e(artifact.id)}" ${(recorded?.artifactIds ?? []).includes(artifact.id) ? 'checked' : ''} ${disable(stale())}/>Image ${index + 1} · ${e(artifact.operation)} · ${artifact.width} × ${artifact.height}</label>`).join('')}` : ''}<div class="form-row check-row"><label>Outcome<select name="outcome" ${disable(stale())}>${['unknown', 'passed', 'failed'].map((outcome) => `<option ${recorded?.outcome === outcome ? 'selected' : ''}>${outcome}</option>`).join('')}</select></label><label>Observation<input name="note" value="${e(recorded?.note)}" maxlength="3000" required placeholder="What happened in your trial?" ${disable(stale())}/></label><button class="button" ${disable(stale())}>Record</button></div>${recorded ? `<p class="check-result">Recorded ${e(recorded.outcome)} · ${e(new Date(recorded.recordedAt).toLocaleString())}</p>` : ''}</form>`;
            })
            .join('')}</section>`
        : ''
    }</div>
    <aside class="ideas" aria-label="Available configurations"><div class="ideas-head"><h3>Possible second lives</h3><span>${plans.length} procedures</span></div><div class="ideas-list">${ideaRows(plans)}</div><p class="ideas-foot">Starter procedures are authored examples. New AI ideas appear here after an explicit generation request.</p></aside></div>`;
}
function cameraPage(): string {
  const build = currentBuild();
  const plan = currentPlan();
  const allocatedCameras = plan.allocations
    .filter((allocation) => allocation.matchedCapabilities.includes('camera'))
    .map((allocation) => workspace.inventory.find((item) => item.id === allocation.itemId)!);
  if (!allocatedCameras.some((item) => item.id === bindingItem))
    bindingItem = allocatedCameras[0]?.id ?? '';
  const canAttach = Boolean(build && !stale() && bindingItem);
  const trials = workspace.deviceTrials;
  return `<div class="hero"><div><p class="eyebrow">Device Alchemy / Camera Lab</p><h1 tabindex="-1">Give a device a new job.</h1><p>Capture, inspect, and keep evidence tied to your build.</p></div>${button('Back to build', 'view-bench', { icon: 'arrow', small: true })}</div>${notice()}<div class="camera-layout"><div><div class="preview" id="camera-preview">${camera?.active ? '' : `<div class="preview-empty">${icon('camera')}<h2>Your spare camera, repurposed.</h2><p>Open a browser camera when you’re ready. No microphone is requested.</p></div>`}<span class="preview-label">${camera?.active ? 'LIVE LOCAL PREVIEW' : 'CAMERA OFF'}</span></div><div class="actions" id="capture-actions">${button(camera?.active ? 'Close camera' : 'Open camera', camera?.active ? 'close-camera' : 'open-camera', { primary: !camera?.active, icon: 'camera', off: openingCamera })}${button('Capture frame', 'capture', { off: !camera?.active || !canAttach || !sourceConfirmed })}${fileInput('Import build image', 'build-image', 'image/png,image/jpeg', !canAttach || !sourceConfirmed)}</div><p class="small muted">${canAttach ? `Build: ${e(plan.recipe.title)}. Confirm which physical inventory device supplies your image source.` : 'Start a current build with an allocated camera before attaching images. Standalone device trials are available separately.'}</p><div class="gallery" id="build-gallery"></div><div id="crop-host">${crop ? cropPanel() : ''}</div></div><div class="camera-controls"><label>Browser camera<select id="browser-camera" aria-label="Browser camera" ${disable(Boolean(camera?.active))}><option value="">Default camera</option>${devices.map((device) => `<option value="${e(device.deviceId)}" ${browserDevice === device.deviceId ? 'selected' : ''}>${e(device.label || 'Camera')}</option>`).join('')}</select></label><label>Inventory device for this build<select id="binding-item" aria-label="Inventory device for this build" ${disable(!canAttach)}>${allocatedCameras.map((item) => `<option value="${e(item.id)}" ${bindingItem === item.id ? 'selected' : ''}>${e(item.name)}</option>`).join('') || '<option>No allocated camera</option>'}</select></label><p>Browser camera labels do not authenticate inventory identity. Your selection associates the source with the declared device.</p><label class="trial-confirm"><input id="source-confirmed" type="checkbox" ${sourceConfirmed ? 'checked' : ''} ${disable(!canAttach)} />I confirm this camera or imported image source represents the selected inventory device.</label><form id="sequence-form" data-draft-key="sequence-${e(build?.id)}"><h3>Timed evidence</h3><div class="form-row"><label>Frames<input name="frames" type="number" min="2" max="60" value="3" required ${disable()}/></label><label>Interval (ms)<input name="interval" type="number" min="100" max="60000" step="1" value="1000" required ${disable()}/></label></div><div class="actions"><button class="button" ${disable(!camera?.active || !canAttach || !sourceConfirmed)}>Capture sequence</button>${sequenceAbort ? '<button type="button" class="button" data-action="stop-sequence">Stop sequence</button>' : ''}</div></form><p>Foreground still frames. Actual intervals are recorded; overdue slots are skipped. Keep this tab visible.</p><section class="trial-panel"><h3>Test a camera function</h3><form id="trial-form" data-draft-key="camera-trial"><label>Inventory device<select name="item" aria-label="Inventory device" ${disable()}><option value="">Choose your actual device</option>${workspace.inventory
    .filter(
      (item) => item.available && item.kind === 'device' && item.capabilities.includes('camera'),
    )
    .map((item) => `<option value="${e(item.id)}">${e(item.name)}</option>`)
    .join(
      '',
    )}</select></label><p>A separate trial opens a camera, captures one decodable frame, then closes it. Confirm the physical device before applying the result.</p><button class="button" ${disable(Boolean(camera?.active))}>Run frame trial</button></form></section></div></div>${trials.length ? `<section class="section"><h2>Device trials</h2>${trials.map((trial) => `<div class="evidence-build"><h3>${e(workspace.inventory.find((item) => item.id === trial.itemId)?.name ?? trial.itemId)}</h3><p>${e(trial.outcome)} · ${e(trial.context)} · ${workspace.inventory.some((item) => deviceTrialIsCurrent(trial, item)) ? 'current' : 'configuration changed'}</p><p>${e(trial.note)}</p>${trial.artifact ? `<figure class="photo source-photo"><div data-photo-id="${e(trial.artifact.id)}" data-photo-label="Camera frame from this device trial"></div><figcaption>Original trial frame · ${e(trial.context)}</figcaption></figure>` : ''}${trial.outcome === 'frame-produced' ? `<form class="apply-trial" data-trial="${e(trial.id)}"><label class="trial-confirm"><input type="checkbox" name="confirmed" required />I confirm this frame came from this physical inventory device.</label><button class="button small" ${disable(trial.context !== 'owner-device')}>Apply camera result</button></form>` : ''}</div>`).join('')}</section>` : ''}`;
}
function cropPanel(): string {
  if (!crop) return '';
  return `<section class="crop-panel"><div class="section-head"><h2>Correct perspective</h2>${button('Close', 'close-crop', { small: true })}</div><div class="crop-layout"><div class="crop-stage"><img src="${e(crop.url)}" alt="Original build image with editable crop corners" /><svg id="crop-overlay" viewBox="0 0 ${crop.image.artifact.width} ${crop.image.artifact.height}" aria-label="Drag the four corners or use numeric controls"><polygon points="${crop.corners.map((point) => `${point.x},${point.y}`).join(' ')}"/>${crop.corners.map((point, index) => `<circle data-corner="${index}" cx="${point.x}" cy="${point.y}" r="${Math.max(crop!.image.artifact.width / 65, 5)}"/>`).join('')}</svg></div><form id="crop-form" data-draft-key="crop-${e(crop.image.artifact.id)}" class="crop-controls"><p>Top-left, top-right, bottom-right, bottom-left. Move the corners over the target, or enter pixel coordinates below. A correction retains its original image.</p><div class="corner-inputs">${crop.corners.map((point, index) => `<div class="form-row"><span>${index + 1}</span><label class="sr-only" for="corner-${index}-x">Corner ${index + 1} x</label><input id="corner-${index}-x" data-coordinate="${index}-x" name="x${index}" type="number" value="${Math.round(point.x)}" min="0" max="${crop!.image.artifact.width - 1}" step="any"/><label class="sr-only" for="corner-${index}-y">Corner ${index + 1} y</label><input id="corner-${index}-y" data-coordinate="${index}-y" name="y${index}" type="number" value="${Math.round(point.y)}" min="0" max="${crop!.image.artifact.height - 1}" step="any"/></div>`).join('')}</div><div class="form-row"><label>Output width<input name="width" type="number" min="2" max="3000" value="800" required /></label><label>Output height<input name="height" type="number" min="2" max="3000" value="600" required /></label></div><p>No dimensions or optical accuracy are inferred. Maximum output: 6 megapixels.</p><button class="button primary" ${disable(stale())}>Save corrected image</button></form></div></section>`;
}
function evidencePage(): string {
  return `<div class="hero"><div><p class="eyebrow">Build ledger / Evidence</p><h1 tabindex="-1">Keep the proof. Know its limits.</h1><p>Progress, observations, originals, and corrections stay together.</p></div></div>${notice()}<div class="actions">${button('Export with photos', 'export-bundle', { primary: true, icon: 'download' })}${button('Download report', 'export-report', { icon: 'download' })}${fileInput('Restore workspace', 'workspace-import', '.json')}${button('Metadata only', 'export-metadata', { small: true })}</div><p class="small muted">A full bundle includes private inventory and photos. Share only what you intend to publish. A checksum verifies bytes, not physical success.</p>${
    workspace.builds.length
      ? workspace.builds
          .map((build) => {
            const recipe = workbenchCatalog(workspace).find((entry) => entry.id === build.recipeId);
            const status = recipe
              ? buildStatus(build, planRecipe(recipe, workspace.inventory))
              : 'recipe-unavailable';
            return `<article class="evidence-build"><div class="section-head"><div><h3>${e(recipe?.title ?? build.recipeId)}</h3><p>${e(new Date(build.startedAt).toLocaleString())}</p></div>${tag(status, status === 'stale' ? 'warn' : 'neutral')}</div><p>${build.completedSteps.length}/${recipe?.steps.length ?? '?'} steps recorded · ${build.results.length} check result(s) · ${build.artifacts.length} image(s)</p><p>${e(build.results.map((result) => `${result.checkId}: ${result.outcome}`).join(' · '))}</p><div class="actions">${button('Open build', 'open-build', { id: build.id, small: true })}</div></article>`;
          })
          .join('')
      : '<section class="empty"><h2>Your first build starts a record.</h2><p>Choose a procedure in the workbench, start a build, and record what happens.</p></section>'
  }<section class="section"><div class="section-head"><div><h2>Photo-assisted inventory</h2><p>AI suggests objects and functions. You confirm the actual parts.</p></div></div><p class="small muted">${model.vision?.configured ? `Selected photos and your declared inventory are sent to ${e(model.vision.name)} (${e(model.mode)}), only when you request a scan.` : 'Configure a vision model to use this. Photos do not establish dimensions or tested capabilities.'}</p><div class="actions">${fileInput('Choose workshop photo', 'scan-photo', 'image/png,image/jpeg', !model.vision?.configured)}${button('Suggest inventory from photo', 'scan', { primary: true, off: !model.vision?.configured || !scanPhoto, icon: 'spark' })}</div>${scanPhoto ? `<p class="small">Selected: ${e(scanPhoto.name)}. Not sent yet.</p>` : ''}${(
    workspace.inventoryScans ?? []
  )
    .map(
      (scan) =>
        `<div class="evidence-build"><h3>${e(scan.summary)}</h3><figure class="photo source-photo"><div data-photo-id="${e(scan.artifact.id)}" data-photo-label="Original workshop photo for these inventory suggestions"></div><figcaption>Original source photo</figcaption></figure><p>${e(scan.model)} · ${e(scan.context)} · ${scan.proposals.length} suggestions</p>${scan.questionsForOwner.map((question) => `<p>${e(question)}</p>`).join('')}${scan.proposals
          .map((proposal) => {
            const resolution = scan.resolutions.find((entry) => entry.proposalId === proposal.id);
            return `<div class="scan-pending"><strong>${e(proposal.label)}</strong><p>${e(proposal.visibleFeatures)}</p><p>${e(proposal.uncertainties.join(' '))}</p>${resolution ? tag(resolution.action, 'neutral') : button('Review declaration', 'review-candidate', { id: scan.id + '|' + proposal.id, small: true })}${reviewCandidate?.scanId === scan.id && reviewCandidate.proposalId === proposal.id ? `<form id="candidate-form" data-draft-key="candidate-${e(proposal.id)}" class="edit-panel"><h3>Confirm the physical part</h3>${itemFields({ name: proposal.label, kind: proposal.kind ?? 'material', quantity: proposal.countEstimate, capabilities: proposal.capabilitySuggestions.map((suggestion) => suggestion.capability) })}<label>Action<select name="action"><option value="add">Add a new item</option><option value="replace">Replace an existing item by ID</option><option value="reject">Reject this suggestion</option></select></label><label>Existing item ID (replacement only)<input name="existingId" maxlength="100" /></label><label>Owner review note<input name="ownerNote" required maxlength="1500" /></label><label class="trial-confirm"><input type="checkbox" name="confirmed" />I confirm identity, count, functions, and any entered measurements from the actual object.</label><div class="actions"><button class="button primary" ${disable()}>Save decision</button>${button('Cancel', 'cancel-candidate', { small: true })}</div></form>` : ''}</div>`;
          })
          .join('')}</div>`,
    )
    .join('')}</section>`;
}
function render(): void {
  evidenceUrls.forEach((url) => URL.revokeObjectURL(url));
  evidenceUrls = [];
  root.querySelectorAll<HTMLFormElement>('form[data-draft-key]').forEach((form) => {
    const key = form.dataset.draftKey!;
    if (!discardedDrafts.has(key))
      formDrafts.set(
        key,
        Array.from(
          form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
            'input[name],select[name],textarea[name]',
          ),
        ).map((field) => ({
          name: field.name,
          value: field.value,
          ...(field instanceof HTMLInputElement && field.type === 'checkbox'
            ? { checked: field.checked }
            : {}),
        })),
      );
  });
  const focusId = document.activeElement?.id || focusAnchor;
  if (focusId) focusAnchor = focusId;
  root.innerHTML = `<header class="topbar"><a class="brand" href="/" aria-label="SCRAPMIND home"><span class="brand-mark" aria-hidden="true">↗↙</span>SCRAPMIND<sub>SECOND-LIFE LAB</sub></a><nav class="nav" aria-label="Workbench sections">${(['bench', 'camera', 'evidence'] as View[]).map((target) => `<button data-action="view-${target}" ${view === target ? 'aria-current="page"' : ''} ${busy ? 'disabled' : ''}>${icon(target === 'bench' ? 'bench' : target === 'camera' ? 'camera' : 'check')}${target === 'bench' ? 'Workbench' : target === 'camera' ? 'Camera Lab' : 'Evidence'}</button>`).join('')}</nav><div class="top-actions"><button class="model-status" data-action="settings" aria-label="AI model settings"><span class="status-dot${model.enabled ? ' on' : ''}"></span>${modelLoaded ? (model.enabled ? e(model.name) : 'AI · connect a model') : 'Checking AI…'}</button>${button('Export', 'export-bundle', { icon: 'download', small: true })}</div></header><div class="shell">${inventory()}<main id="main" tabindex="-1"><button class="button inventory-toggle" data-action="toggle-inventory" aria-expanded="${inventoryOpen}" aria-controls="inventory">Your parts · ${workspace.inventory.length}</button>${view === 'bench' ? bench() : view === 'camera' ? cameraPage() : evidencePage()}<footer class="footer-note"><span>Local workspace · no background inference</span><a href="https://github.com/rudycelekli/scrapmind" target="_blank" rel="noopener noreferrer">Open source ↗</a></footer></main></div>`;
  root.querySelectorAll<HTMLFormElement>('form[data-draft-key]').forEach((form) => {
    const draft = formDrafts.get(form.dataset.draftKey!);
    if (!draft) return;
    form
      .querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'input[name],select[name],textarea[name]',
      )
      .forEach((field) => {
        const value = draft.find(
          (entry) =>
            entry.name === field.name &&
            (!(field instanceof HTMLInputElement) ||
              field.type !== 'checkbox' ||
              entry.value === field.value),
        );
        if (value) {
          if (field instanceof HTMLInputElement && field.type === 'checkbox')
            field.checked = value.checked ?? false;
          else field.value = value.value;
        }
      });
  });
  discardedDrafts.clear();
  if (busy)
    root
      .querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'form input,form select,form textarea',
      )
      .forEach((field) => {
        field.disabled = true;
      });
  if (camera?.active && view === 'camera')
    document.querySelector('#camera-preview')?.prepend(camera.video);
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  if (!busy) focusAnchor = undefined;
  if (view === 'camera') void refreshGallery();
  void refreshSourcePhotos();
  if (crop) wireCorners();
}
function showError(error: unknown): void {
  message =
    error instanceof DOMException && error.name === 'AbortError'
      ? 'Request stopped. Already dispatched provider calls may have been processed.'
      : error instanceof Error
        ? error.message
        : 'The operation failed. Your saved workspace was kept.';
  if (message.includes('[') && message.length > 500)
    message =
      'The data does not match the SCRAPMIND contract. Check required fields, supported functions, quantities, and references.';
  messageKind = 'error';
}
async function run(label: string, action: () => Promise<void>): Promise<void> {
  if (busy) return;
  busy = true;
  message = label;
  messageKind = 'progress';
  render();
  try {
    await action();
    if (messageKind === 'progress') {
      message = 'Saved in this browser.';
      messageKind = 'success';
    }
  } catch (error) {
    showError(error);
  } finally {
    busy = false;
    render();
  }
}
async function commit(next: Workspace): Promise<void> {
  next = workspaceSchema.parse(next);
  if (store) {
    try {
      revision = await store.save(next, revision);
    } catch (error) {
      recoveryWorkspace = next;
      throw error;
    }
  }
  recoveryWorkspace = undefined;
  workspace = next;
}
async function saveImage(image: CapturedImage): Promise<void> {
  if (!images)
    throw new Error(
      'Image storage is unavailable. Enable browser storage and reload before recording media.',
    );
  await images.put(image);
}
async function changeAvailability(id: string, available: boolean): Promise<void> {
  const before = currentPlan();
  sourceConfirmed = false;
  await commit(setWorkbenchAvailability(workspace, id, available));
  changes = describeReplan(before, currentPlan(), workspace.inventory);
  if (!changes.length)
    changes = [
      `${workspace.inventory.find((item) => item.id === id)?.name ?? id} is ${available ? 'available' : 'unavailable'}. Current role assignments stay the same.`,
    ];
}
function readItem(form: HTMLFormElement, id: string): InventoryItem {
  const data = new FormData(form);
  const dimensions: Record<string, number> = {};
  for (const key of ['length', 'width', 'height']) {
    const value = String(data.get(key) ?? '');
    if (value) dimensions[key] = Number(value);
  }
  return itemSchema.parse({
    id,
    name: data.get('name'),
    kind: data.get('kind'),
    quantity: Number(data.get('quantity')),
    available: true,
    capabilities: data.getAll('capabilities'),
    testedCapabilities: [],
    evidence: 'declared',
    notes: data.get('notes') ?? '',
    ...(Object.keys(dimensions).length ? { dimensions } : {}),
  });
}
function binding(): ImageBinding {
  if (!sourceConfirmed)
    throw new Error('Confirm which allocated inventory device supplies the image source.');
  const build = currentBuild();
  const plan = currentPlan();
  if (
    !build ||
    stale() ||
    !plan.allocations.some(
      (a) => a.itemId === bindingItem && a.matchedCapabilities.includes('camera'),
    )
  )
    throw new Error('Choose a current build and an allocated camera.');
  return {
    id: crypto.randomUUID(),
    buildId: build.id,
    itemId: bindingItem,
    inventoryFingerprint: plan.inventoryFingerprint,
    recipeFingerprint: plan.recipeFingerprint,
  };
}
async function attach(image: CapturedImage): Promise<void> {
  const next = await attachWorkbenchImage(workspace, currentBuild()!.id, image);
  await saveImage(image);
  await commit(next);
}
async function api(path: string, input: unknown, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Scrapmind-Request': '1' },
    body: JSON.stringify(input),
    signal,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The model request failed.');
  return result;
}
function download(text: string, name: string, type = 'application/json'): void {
  downloadBlob(new Blob([text], { type }), name);
}
function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function stopCamera(): void {
  sourceConfirmed = false;
  cameraGeneration++;
  sequenceAbort?.abort();
  camera?.stop();
  camera = undefined;
  openingCamera = false;
}
function navigate(next: View): void {
  if (next !== 'camera') stopCamera();
  view = next;
  message = '';
  render();
  document.querySelector<HTMLElement>('#main h1')?.focus();
}
async function refreshGallery(): Promise<void> {
  const host = document.querySelector('#build-gallery');
  const generation = host;
  if (!host || !images) return;
  const build = currentBuild();
  const entries = build?.artifacts ?? [];
  const urls: string[] = [];
  const figures: string[] = [];
  for (const [index, artifact] of entries.entries()) {
    try {
      const image = await images.get(artifact.id);
      if (!image) {
        figures.push(
          `<p class="small">Image ${index + 1}: bytes missing. Restore its full bundle.</p>`,
        );
        continue;
      }
      const url = URL.createObjectURL(image.blob);
      urls.push(url);
      figures.push(
        `<figure class="photo"><img src="${e(url)}" alt="Build evidence image ${index + 1}" loading="lazy"/><figcaption>${artifact.width} × ${artifact.height} · ${e(artifact.operation)}${artifact.timing ? ` · ${Math.round(artifact.timing.elapsedMs)} ms` : ''}</figcaption><div class="actions">${button('Download', 'download-image', { id: artifact.id, small: true })}${button('Correct perspective', 'crop', { id: artifact.id, small: true, off: stale() })}</div></figure>`,
      );
    } catch {
      figures.push(`<p class="small">Image ${index + 1}: checksum or storage error.</p>`);
    }
  }
  if (document.querySelector('#build-gallery') !== generation) {
    urls.forEach((url) => URL.revokeObjectURL(url));
    return;
  }
  galleryUrls.forEach((url) => URL.revokeObjectURL(url));
  galleryUrls = urls;
  host.innerHTML = figures.join('');
}
async function refreshSourcePhotos(): Promise<void> {
  if (!images) return;
  for (const slot of root.querySelectorAll<HTMLElement>('[data-photo-id]')) {
    try {
      const image = await images.get(slot.dataset.photoId!);
      if (!slot.isConnected) continue;
      if (!image) {
        slot.textContent = 'Source image bytes are missing. Restore a full bundle.';
        continue;
      }
      const url = URL.createObjectURL(image.blob);
      evidenceUrls.push(url);
      slot.innerHTML = `<img src="${e(url)}" alt="${e(slot.dataset.photoLabel ?? 'Source evidence photo')}" loading="lazy" />`;
    } catch {
      if (slot.isConnected)
        slot.textContent = 'Source photo could not be read or its checksum changed.';
    }
  }
}
function clearCrop(): void {
  if (crop) URL.revokeObjectURL(crop.url);
  crop = undefined;
}
function wireCorners(): void {
  const overlay = document.querySelector<SVGSVGElement>('#crop-overlay');
  if (!overlay || !crop) return;
  let dragged: number | undefined;
  function update() {
    if (!crop) return;
    overlay!
      .querySelector('polygon')
      ?.setAttribute('points', crop.corners.map((p) => `${p.x},${p.y}`).join(' '));
    crop.corners.forEach((p, index) => {
      const circle = overlay!.querySelector(`[data-corner="${index}"]`);
      circle?.setAttribute('cx', String(p.x));
      circle?.setAttribute('cy', String(p.y));
      for (const axis of ['x', 'y'] as const) {
        const field = document.querySelector<HTMLInputElement>(`#corner-${index}-${axis}`);
        if (field) field.value = String(Math.round(p[axis]));
      }
    });
  }
  overlay.addEventListener('pointerdown', (event) => {
    const target = event.target as Element;
    const index = target.getAttribute('data-corner');
    if (index === null) return;
    dragged = Number(index);
    overlay.setPointerCapture(event.pointerId);
  });
  overlay.addEventListener('pointermove', (event) => {
    if (dragged === undefined || !crop) return;
    const bounds = overlay.getBoundingClientRect();
    crop.corners[dragged] = {
      x: Math.max(
        0,
        Math.min(
          crop.image.artifact.width - 1,
          ((event.clientX - bounds.left) / bounds.width) * crop.image.artifact.width,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          crop.image.artifact.height - 1,
          ((event.clientY - bounds.top) / bounds.height) * crop.image.artifact.height,
        ),
      ),
    };
    update();
  });
  overlay.addEventListener('pointerup', () => {
    dragged = undefined;
  });
  overlay.addEventListener('pointercancel', () => {
    dragged = undefined;
  });
  document.querySelectorAll<HTMLInputElement>('[data-coordinate]').forEach((field) =>
    field.addEventListener('input', () => {
      if (!crop) return;
      const [index, axis] = field.dataset.coordinate!.split('-');
      crop.corners[Number(index)][axis as 'x' | 'y'] = Number(field.value);
      const polygon = overlay.querySelector('polygon');
      polygon?.setAttribute('points', crop.corners.map((p) => `${p.x},${p.y}`).join(' '));
      const circle = overlay.querySelector(`[data-corner="${index}"]`);
      circle?.setAttribute(axis === 'x' ? 'cx' : 'cy', field.value);
    }),
  );
}
root.addEventListener('click', (event) => {
  const target = (event.target as Element).closest<HTMLElement>('[data-action]');
  if (!target) return;
  const action = target.dataset.action!,
    id = target.dataset.id ?? '';
  if (busy && !['cancel-model', 'stop-sequence', 'close-camera'].includes(action)) return;
  if (action === 'dismiss') {
    message = '';
    render();
    return;
  }
  if (action === 'settings') {
    settingsOpen = !settingsOpen;
    view = 'bench';
    stopCamera();
    render();
    return;
  }
  if (action === 'toggle-inventory') {
    inventoryOpen = !inventoryOpen;
    render();
    return;
  }
  if (action.startsWith('view-')) {
    navigate(action.slice(5) as View);
    return;
  }
  if (action === 'select-plan') {
    selected = id;
    selectedBuild = '';
    changes = [];
    clearCrop();
    render();
    return;
  }
  if (action === 'add-item' || action === 'edit-item') {
    editing = action === 'add-item' ? '' : id;
    inventoryOpen = true;
    render();
    document.querySelector<HTMLInputElement>('#item-form input[name=name]')?.focus();
    return;
  }
  if (action === 'cancel-edit') {
    editing = undefined;
    render();
    return;
  }
  if (action === 'reset-prompt') {
    resetPending = true;
    view = 'bench';
    stopCamera();
    render();
    return;
  }
  if (action === 'reset-cancel') {
    resetPending = false;
    render();
    return;
  }
  if (action === 'reset-empty') {
    void run('Starting your workbench…', async () => {
      await commit(createWorkbench('My workbench', []));
      resetPending = false;
      editing = '';
      selectedBuild = '';
      changes = [];
      clearCrop();
    });
    return;
  }
  if (action === 'delete-item') {
    void run('Removing the declaration…', async () => {
      await commit(
        updateWorkbenchInventory(
          workspace,
          workspace.inventory.filter((item) => item.id !== id),
        ),
      );
      editing = undefined;
      changes = ['Part removed. Existing builds retain their original revision.'];
    });
    return;
  }
  if (action === 'challenge') {
    void run('Replanning with the remaining parts…', () => changeAvailability(id, false));
    return;
  }
  if (action === 'start-build') {
    void run('Starting a build record…', async () => {
      await commit(startWorkbenchBuild(workspace, currentPlan().recipe.id));
      selectedBuild = workspace.builds[workspace.builds.length - 1].id;
      sourceConfirmed = false;
      message = 'Build started. Record steps and observations as you go.';
      messageKind = 'success';
    }).then(() => {
      document.querySelector('#build-section')?.scrollIntoView({
        block: 'start',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
      document.querySelector<HTMLElement>('#build-title')?.focus({ preventScroll: true });
    });
    return;
  }
  if (action === 'step') {
    void run('Saving progress…', async () => {
      const build = currentBuild();
      if (!build) throw new Error('Start a build first.');
      await commit(
        completeWorkbenchStep(workspace, build.id, id, !build.completedSteps.includes(id)),
      );
    });
    return;
  }
  if (action === 'open-build') {
    const build = workspace.builds.find((entry) => entry.id === id);
    if (build) {
      selected = build.recipeId;
      selectedBuild = id;
      navigate('bench');
      document.querySelector('#build-section')?.scrollIntoView({ block: 'start' });
    }
    return;
  }
  if (action === 'cancel-model') {
    modelAbort?.abort();
    return;
  }
  if (action === 'stop-sequence') {
    sequenceAbort?.abort();
    return;
  }
  if (action === 'close-camera') {
    stopCamera();
    render();
    return;
  }
  if (action === 'open-camera') {
    const generation = ++cameraGeneration;
    openingCamera = true;
    void run('Waiting for camera permission…', async () => {
      const opened = await CameraSession.open({ deviceId: browserDevice || undefined });
      if (generation !== cameraGeneration || view !== 'camera') {
        opened.stop();
        return;
      }
      camera = opened;
      sourceConfirmed = false;
      devices = (await navigator.mediaDevices.enumerateDevices()).filter(
        (device) => device.kind === 'videoinput',
      );
      camera.endedSignal.addEventListener(
        'abort',
        () => {
          if (camera === opened && !busy) {
            message = 'Camera disconnected or closed. Open it again explicitly when ready.';
            messageKind = 'error';
            render();
          }
        },
        { once: true },
      );
      message = 'Camera open. Preview stays on this device.';
      messageKind = 'success';
    }).finally(() => {
      openingCamera = false;
      render();
    });
    return;
  }
  if (action === 'capture') {
    void run('Capturing and saving a frame…', async () => {
      if (!camera) throw new Error('Open your camera first.');
      await attach(await camera.capture(binding()));
      message = 'Original frame attached to this build.';
      messageKind = 'success';
    });
    return;
  }
  if (action === 'download-image') {
    void run('Verifying the original image bytes…', async () => {
      const image = await images?.get(id);
      if (!image) throw new Error('Image bytes are missing. Restore a full bundle.');
      downloadBlob(
        image.blob,
        `scrapmind-${image.artifact.operation}-${image.artifact.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)}.${image.artifact.mimeType === 'image/png' ? 'png' : 'jpg'}`,
      );
      message =
        'Image downloaded with its saved pixels. No new detail or physical result was inferred.';
      messageKind = 'success';
    });
    return;
  }
  if (action === 'close-crop') {
    clearCrop();
    render();
    return;
  }
  if (action === 'crop') {
    void run('Loading the original image…', async () => {
      const image = await images?.get(id);
      if (!image) throw new Error('Image bytes are missing. Restore a full bundle.');
      clearCrop();
      const { width, height } = image.artifact;
      crop = {
        image,
        url: URL.createObjectURL(image.blob),
        corners: [
          { x: 0, y: 0 },
          { x: width - 1, y: 0 },
          { x: width - 1, y: height - 1 },
          { x: 0, y: height - 1 },
        ],
      };
      message = 'Move the four corners over your target.';
      messageKind = 'success';
    });
    return;
  }
  if (action === 'export-recovery') {
    const pending = recoveryWorkspace;
    if (pending)
      void run('Verifying the unsaved workspace for recovery…', async () => {
        download(
          await exportEvidenceBundle(
            pending,
            (id) => images?.get(id) ?? Promise.resolve(undefined),
          ),
          'scrapmind-unsaved-recovery-bundle.json',
        );
        message =
          'Unsaved work downloaded as a full bundle. Reload the newer workspace before deciding what to restore.';
        messageKind = 'success';
      });
    return;
  }
  if (action === 'export-metadata') {
    download(exportWorkspace(workspace), 'scrapmind-workspace.json');
    return;
  }
  if (action === 'export-bundle') {
    void run('Verifying images for export…', async () => {
      download(
        await exportEvidenceBundle(
          workspace,
          (id) => images?.get(id) ?? Promise.resolve(undefined),
        ),
        'scrapmind-evidence-bundle.json',
      );
      message = 'Full bundle downloaded. It includes your inventory and referenced photos.';
      messageKind = 'success';
    });
    return;
  }
  if (action === 'export-report') {
    void run('Auditing evidence for the report…', async () => {
      const report = await reportWorkbench(
        workspace,
        (artifact) => images?.get(artifact.id) ?? Promise.resolve(undefined),
      );
      download(renderWorkbenchReport(report), 'scrapmind-build-report.md', 'text/markdown');
      message = 'Report downloaded with current build status and image-byte integrity.';
      messageKind = 'success';
    });
    return;
  }
  if (action === 'scan') {
    const photo = scanPhoto;
    if (!photo) return;
    void run('Inspecting your selected photo with the configured vision model…', async () => {
      modelAbort = new AbortController();
      render();
      try {
        const scan = inventoryScanSchema.parse(
          await api(
            '/api/scan',
            {
              inventory: workspace.inventory,
              image: await photoDataUrl(photo),
              context: 'owner-photo',
            },
            modelAbort.signal,
          ),
        );
        const image = { artifact: scan.artifact, blob: photo };
        // Decode locally before persisting returned observations; the server only inspects headers.
        const bitmap = await createImageBitmap(photo, { imageOrientation: 'none' });
        try {
          if (bitmap.width !== scan.artifact.width || bitmap.height !== scan.artifact.height)
            throw new Error('Normalize photo orientation before scanning.');
        } finally {
          bitmap.close();
        }
        const next = await saveWorkbenchScan(workspace, { scan, image });
        await saveImage(image);
        await commit(next);
        scanPhoto = undefined;
        message =
          'Photo suggestions saved. Review the actual objects before accepting declarations.';
        messageKind = 'success';
      } finally {
        modelAbort = undefined;
      }
    });
    return;
  }
  if (action === 'review-candidate') {
    const [scanId, proposalId] = id.split('|');
    reviewCandidate = { scanId, proposalId };
    render();
    return;
  }
  if (action === 'cancel-candidate') {
    reviewCandidate = undefined;
    render();
    return;
  }
});
root.addEventListener('input', (event) => {
  const field = event.target as HTMLInputElement;
  if (field.id === 'goal') {
    goal = field.value;
    const list = document.querySelector('.ideas-list');
    if (list)
      list.innerHTML = ideaRows(
        discoverPlans(workspace.inventory, goal, workbenchCatalog(workspace)),
      );
  }
});
root.addEventListener('change', (event) => {
  const field = event.target as HTMLInputElement;
  if (field.dataset.availability) {
    const id = field.dataset.availability;
    const available = field.checked;
    void run('Updating availability and replanning…', () => changeAvailability(id, available));
    return;
  }
  if (field.id === 'idea-count') {
    count = Number(field.value);
    return;
  }
  if (field.id === 'build-history') {
    selectedBuild = field.value;
    sourceConfirmed = false;
    clearCrop();
    render();
    return;
  }
  if (field.id === 'browser-camera') {
    browserDevice = field.value;
    return;
  }
  if (field.id === 'binding-item') {
    bindingItem = field.value;
    sourceConfirmed = false;
    render();
    return;
  }
  if (field.id === 'source-confirmed') {
    sourceConfirmed = field.checked;
    render();
    return;
  }
  if (!field.files?.[0]) return;
  const file = field.files[0];
  if (field.id === 'scan-photo') {
    if (file.size > 6_000_000) {
      message = 'Choose a PNG or JPEG up to 6 MB.';
      messageKind = 'error';
    } else {
      scanPhoto = file;
      message =
        'Photo selected. Press Suggest inventory to send it to your configured vision model.';
      messageKind = 'success';
    }
    render();
    return;
  }
  if (field.id === 'build-image') {
    void run('Validating and importing the build image…', async () => {
      if (file.size > 20_000_000) throw new Error('Build image exceeds 20 MB.');
      await attach(await importImage(file, binding()));
      message = 'Imported original attached. No capture timestamp was inferred.';
      messageKind = 'success';
    });
    return;
  }
  if (field.id === 'workspace-import') {
    void run('Validating the workspace before restoring…', async () => {
      if (file.size > 35_000_000)
        throw new Error('Workspace or bundle exceeds the 35 MB import bound.');
      const text = await file.text();
      const header = JSON.parse(text);
      let next: Workspace;
      const importedImages: CapturedImage[] = [];
      if (header.format === 'scrapmind-evidence-bundle') {
        const bundle = await importEvidenceBundle(text);
        next = bundle.workspace;
        importedImages.push(...bundle.images);
      } else next = importWorkspace(text);
      for (const image of importedImages) {
        const existing = await images?.get(image.artifact.id);
        if (existing) {
          if (JSON.stringify(existing.artifact) !== JSON.stringify(image.artifact))
            throw new Error(
              'An image ID already exists with different metadata. Use a new browser profile for this bundle.',
            );
        } else await saveImage(image);
      }
      await commit(next);
      selectedBuild = '';
      changes = [];
      editing = undefined;
      clearCrop();
      stopCamera();
      message =
        'Workspace restored. Metadata-only imports may need their original photos; the report identifies missing bytes.';
      messageKind = 'success';
    });
  }
});
root.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  if (busy) return;
  const data = new FormData(form);
  const draftKey = form.dataset.draftKey;
  if (form.id === 'goal-form') {
    goal = String(data.get('goal') ?? '').trim();
    count = Number(data.get('count'));
    if (!model.enabled) {
      settingsOpen = true;
      render();
      return;
    }
    if (goal.length < 3) {
      message = 'Describe what you want to make in at least three characters.';
      messageKind = 'error';
      render();
      return;
    }
    const input = { inventory: workspace.inventory, goal, count };
    void run('Generating ideas, checking resources, and requesting critique…', async () => {
      modelAbort = new AbortController();
      render();
      try {
        const result = (await api('/api/ideate', input, modelAbort.signal)) as IdeationResult;
        await commit(saveWorkbenchIdeas(workspace, result));
        selected = result.proposals[0].recipe.id;
        selectedBuild = '';
        changes = [];
        message = `${result.proposals.length} draft idea(s) saved. Read the procedure and resource review before building.`;
        messageKind = 'success';
      } finally {
        modelAbort = undefined;
      }
    });
    return;
  }
  if (form.id === 'item-form') {
    let item: InventoryItem;
    try {
      item = readItem(form, editing || crypto.randomUUID());
    } catch (error) {
      showError(error);
      render();
      return;
    }
    void run('Saving your declaration…', async () => {
      const existing = workspace.inventory.find((entry) => entry.id === item.id);
      item = { ...item, available: existing?.available ?? true };
      await commit(
        updateWorkbenchInventory(workspace, [
          ...workspace.inventory.filter((entry) => entry.id !== item.id),
          item,
        ]),
      );
      if (draftKey) forgetDraft(draftKey);
      editing = undefined;
      changes = ['Inventory declaration changed. Previous builds keep their original revision.'];
    });
    return;
  }
  if (form.id === 'review-form') {
    void run('Saving your draft review…', async () => {
      await commit(
        reviewWorkbenchRecipe(
          workspace,
          selected,
          data.get('reviewed') === 'on',
          data.get('issues') === 'on',
        ),
      );
      message =
        'Draft review recorded. Resource matching does not establish physical compatibility.';
      messageKind = 'success';
    });
    return;
  }
  if (form.dataset.check) {
    const checkId = form.dataset.check;
    const build = currentBuild();
    if (!build) return;
    void run('Recording your observation…', async () => {
      await commit(
        recordWorkbenchCheck(workspace, build.id, {
          checkId,
          outcome: data.get('outcome') as 'passed' | 'failed' | 'unknown',
          note: String(data.get('note')),
          recordedAt: new Date().toISOString(),
          artifactIds: data.getAll('artifacts').map(String),
        }),
      );
    });
    return;
  }
  if (form.id === 'sequence-form') {
    const frames = Number(data.get('frames')),
      interval = Number(data.get('interval'));
    void run('Capturing timed evidence. Keep this tab visible…', async () => {
      if (!camera) throw new Error('Open your camera first.');
      const source = camera;
      const imageBinding = binding();
      const captured: CapturedImage[] = [];
      sequenceAbort = new AbortController();
      render();
      try {
        for await (const image of captureSequence(
          source,
          imageBinding,
          { id: crypto.randomUUID(), count: frames, intervalMs: interval },
          sequenceAbort.signal,
        )) {
          await attach(image);
          captured.push(image);
          message = `Saved ${captured.length}/${frames} frames. Timing reflects actual capture, including skipped slots.`;
          render();
        }
        const summary = describeSequence(captured);
        message = `${summary.frameCount} originals saved across ${Math.round(summary.elapsedMs)} ms. Actual intervals: ${summary.intervalsMs.map((ms) => Math.round(ms)).join(', ')} ms.`;
        messageKind = 'success';
      } finally {
        sequenceAbort = undefined;
      }
    });
    return;
  }
  if (form.id === 'crop-form') {
    const current = crop;
    if (!current) return;
    const corners: Quad = [0, 1, 2, 3].map((index) => ({
      x: Number(data.get('x' + index)),
      y: Number(data.get('y' + index)),
    })) as Quad;
    const width = Number(data.get('width')),
      height = Number(data.get('height'));
    void run('Correcting perspective and retaining the original…', async () => {
      await attach(
        await correctPerspective(
          current.image,
          {
            id: crypto.randomUUID(),
            buildId: current.image.artifact.buildId,
            itemId: current.image.artifact.itemId,
            inventoryFingerprint: current.image.artifact.inventoryFingerprint,
            recipeFingerprint: current.image.artifact.recipeFingerprint,
          },
          corners,
          width,
          height,
        ),
      );
      clearCrop();
      message =
        'Corrected image saved with its parent original. Both belong to the same build revision.';
      messageKind = 'success';
    });
    return;
  }
  if (form.id === 'trial-form') {
    const item = workspace.inventory.find((entry) => entry.id === data.get('item'));
    if (!item) {
      message = 'Choose the inventory device you will physically connect.';
      messageKind = 'error';
      render();
      return;
    }
    void run('Opening a camera for one frame trial…', async () => {
      const result = await runCameraTrial(item, {
        context: 'owner-device',
        deviceId: browserDevice || undefined,
      });
      const trial = deviceTrialSchema.parse(result.trial);
      if (result.image) await saveImage(result.image);
      await commit(
        workspaceSchema.parse({ ...workspace, deviceTrials: [...workspace.deviceTrials, trial] }),
      );
      message =
        trial.outcome === 'failed'
          ? trial.note
          : 'Frame trial saved. Confirm the physical device association before applying the camera result.';
      messageKind = trial.outcome === 'failed' ? 'error' : 'success';
    });
    return;
  }
  if (form.dataset.trial) {
    const trial = workspace.deviceTrials.find((entry) => entry.id === form.dataset.trial);
    if (!trial) return;
    void run('Checking the trial and your device confirmation…', async () => {
      const image = trial.artifact ? await images?.get(trial.artifact.id) : undefined;
      if (!image) throw new Error('Restore the matching trial image first.');
      await commit(
        updateWorkbenchInventory(
          workspace,
          await applyCameraTrial(
            workspace.inventory,
            trial,
            image.blob,
            data.get('confirmed') === 'on',
          ),
        ),
      );
      message =
        'Only the camera frame function is recorded as tested. Device identity and physical performance remain owner-associated.';
      messageKind = 'success';
    });
    return;
  }
  if (form.id === 'candidate-form' && reviewCandidate) {
    const candidate = { ...reviewCandidate };
    const action = String(data.get('action'));
    const ownerNote = String(data.get('ownerNote') ?? '');
    let item: InventoryItem | undefined;
    try {
      if (action !== 'reject')
        item = readItem(
          form,
          action === 'replace' ? String(data.get('existingId') ?? '') : crypto.randomUUID(),
        );
    } catch (error) {
      showError(error);
      render();
      return;
    }
    void run('Recording your photo review…', async () => {
      const scan = workspace.inventoryScans!.find((entry) => entry.id === candidate.scanId)!;
      const photo = await images?.get(scan.artifact.id);
      const declaration = item
        ? (({ evidence: _evidence, testedCapabilities: _tested, ...value }) => value)(item)
        : undefined;
      await commit(
        await reviewWorkbenchScan(
          workspace,
          {
            format: 'scrapmind-inventory-review',
            version: 1,
            scanId: candidate.scanId,
            inventoryFingerprint: inventoryFingerprint(workspace.inventory),
            confirmedPhysicalInventory: data.get('confirmed') === 'on',
            decisions: [
              {
                proposalId: candidate.proposalId,
                action,
                ownerNote,
                ...(declaration ? { item: declaration } : {}),
              },
            ],
          },
          photo?.blob,
        ),
      );
      if (draftKey) forgetDraft(draftKey);
      reviewCandidate = undefined;
      message =
        'Owner decision saved. Accepted items have declared functions; photo review never establishes tested capabilities.';
      messageKind = 'success';
    });
  }
});
window.addEventListener('pagehide', () => {
  stopCamera();
  modelAbort?.abort();
  clearCrop();
  galleryUrls.forEach((url) => URL.revokeObjectURL(url));
  evidenceUrls.forEach((url) => URL.revokeObjectURL(url));
  images?.close();
  store?.close();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && camera?.active) {
    stopCamera();
    message = 'Camera stopped because this tab became hidden. Saved frames remain attached.';
    messageKind = 'success';
    render();
  }
});
async function initialize(): Promise<void> {
  render();
  const opened = await Promise.allSettled([BrowserWorkspaceStore.open(), ImageStore.open()]);
  if (opened[0].status === 'fulfilled') {
    try {
      store = opened[0].value;
      const saved = await store.load();
      if (saved) {
        workspace = saved.workspace;
        revision = saved.revision;
      }
    } catch (error) {
      store?.close();
      store = undefined;
      showError(error);
    }
  } else {
    message =
      'Browser workspace storage is unavailable. This session is temporary; export it before leaving.';
    messageKind = 'error';
  }
  if (opened[1].status === 'fulfilled') images = opened[1].value;
  else {
    message =
      'Image storage is unavailable. Planning works, but enable browser storage to keep photo evidence.';
    messageKind = 'error';
  }
  try {
    const response = await fetch('/api/status');
    if (!response.ok) throw new Error('Model status unavailable.');
    const status = await response.json();
    if (typeof status.model?.enabled !== 'boolean') throw new Error('Invalid model status.');
    model = status.model;
  } catch {
    model = { enabled: false };
    message =
      'The local API is unavailable. Your saved workbench remains usable; restart npm run serve to reconnect AI.';
    messageKind = 'error';
  }
  modelLoaded = true;
  render();
}
void initialize();
