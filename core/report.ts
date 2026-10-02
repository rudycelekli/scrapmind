import { workspaceSchema, type Workspace } from './workspace.js';
import { workbenchBuild, workbenchCatalog } from './workbench.js';
import { buildStatus } from './build.js';
import { deviceTrialIsCurrent } from './device-trial.js';
import { verifyImageArtifact, type ImageArtifact } from './evidence.js';
import type { CapturedImage } from './camera.js';
import { inventoryFingerprint } from './schema.js';

export type EvidenceLoader = (artifact: ImageArtifact) => Promise<CapturedImage | undefined>;
export async function reportWorkbench(workspace: Workspace, load?: EvidenceLoader) {
  workspace = workspaceSchema.parse(workspace);
  async function imageStatus(artifact: ImageArtifact) {
    if (!load) return { id: artifact.id, source: artifact.source, checksum: 'unchecked' as const };
    let image: CapturedImage | undefined;
    try {
      image = await load(artifact);
    } catch {
      return { id: artifact.id, source: artifact.source, checksum: 'unreadable' as const };
    }
    return {
      id: artifact.id,
      source: artifact.source,
      checksum: !image
        ? ('missing' as const)
        : (await verifyImageArtifact(artifact, image.blob))
          ? ('verified' as const)
          : ('changed' as const),
    };
  }
  const builds = [];
  for (const session of workspace.builds) {
    const recipe = workbenchCatalog(workspace).find((entry) => entry.id === session.recipeId);
    const state = recipe ? workbenchBuild(workspace, session.id) : undefined;
    const images = [];
    for (const artifact of session.artifacts) images.push(await imageStatus(artifact));
    const recordedStatus = state
      ? buildStatus(session, state.plan)
      : ('recipe-unavailable' as const);
    const mediaIntegrity = images.some((image) =>
      ['missing', 'changed', 'unreadable'].includes(image.checksum),
    )
      ? ('needs-evidence' as const)
      : images.some((image) => image.checksum === 'unchecked')
        ? ('unchecked' as const)
        : ('verified' as const);
    builds.push({
      id: session.id,
      recipeId: session.recipeId,
      title: recipe?.title ?? session.recipeId,
      recordedStatus,
      mediaIntegrity,
      completedSteps: session.completedSteps.length,
      requiredSteps: recipe?.steps.length,
      results: session.results,
      images,
      aiReview: recipe?.ai?.resourceReview,
      assumptionsToTest: recipe?.ai?.assumptionsToTest,
    });
  }
  const deviceTrials = [];
  for (const trial of workspace.deviceTrials) {
    const item = workspace.inventory.find((entry) => entry.id === trial.itemId);
    deviceTrials.push({
      id: trial.id,
      itemId: trial.itemId,
      context: trial.context,
      outcome: trial.outcome,
      current: item ? deviceTrialIsCurrent(trial, item) : false,
      image: trial.artifact ? await imageStatus(trial.artifact) : undefined,
      note: trial.note,
    });
  }
  const inventoryScans = [];
  for (const scan of workspace.inventoryScans ?? []) {
    inventoryScans.push({
      id: scan.id,
      context: scan.context,
      scene: scan.scene,
      model: scan.model,
      mode: scan.mode,
      summary: scan.summary,
      proposals: scan.proposals.length,
      pending: scan.proposals.length - scan.resolutions.length,
      resolutions: scan.resolutions,
      inputContextCurrent:
        scan.inputInventoryFingerprint === inventoryFingerprint(workspace.inventory),
      image: await imageStatus(scan.artifact),
      boundary: scan.boundary,
    });
  }
  return {
    format: 'scrapmind-build-report' as const,
    version: 1 as const,
    name: workspace.name,
    generatedAt: new Date().toISOString(),
    inventoryItems: workspace.inventory.length,
    builds,
    deviceTrials,
    inventoryScans,
    boundary:
      'Results are owner-reported. Verified image checksums establish matching bytes, not scene authenticity, hardware identity, optical quality, mounting fit, or independent physical success.',
  };
}
export type WorkbenchReport = Awaited<ReturnType<typeof reportWorkbench>>;

function markdown(value: string): string {
  return value
    .replace(/[\x00-\x1f\x7f-\x9f]/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/([\\`*_{}\[\]()#+.!|])/g, '\\$1');
}
export function renderWorkbenchReport(report: WorkbenchReport): string {
  const lines = [
    `# SCRAPMIND build report`,
    '',
    markdown(report.name),
    '',
    report.boundary,
    '',
    `Generated: ${report.generatedAt}`,
    `Inventory items: ${report.inventoryItems}`,
  ];
  for (const build of report.builds) {
    lines.push(
      '',
      `## ${markdown(build.title)} — ${markdown(build.id)}`,
      '',
      `Recorded status: **${build.recordedStatus}**`,
      `Image integrity: **${build.mediaIntegrity}**`,
      `Steps recorded: ${build.completedSteps}/${build.requiredSteps ?? 'unknown'}`,
      '',
    );
    for (const result of build.results)
      lines.push(`- ${markdown(result.checkId)}: ${result.outcome} — ${markdown(result.note)}`);
    if (build.aiReview) {
      lines.push(
        '',
        `AI resource review: **${build.aiReview.status}**`,
        markdown(build.aiReview.boundary),
        '',
      );
      for (const issue of build.aiReview.issues)
        lines.push(`- ${markdown(issue.kind)}: ${markdown(issue.detail)}`);
      lines.push('', 'AI assumptions requiring physical inspection:', '');
      for (const assumption of build.assumptionsToTest ?? [])
        lines.push(`- ${markdown(assumption)}`);
    }
    if (build.images.length) {
      lines.push('', 'Image evidence:', '');
      for (const image of build.images)
        lines.push(`- ${markdown(image.id)}: ${image.source}; checksum ${image.checksum}`);
    }
  }
  if (report.deviceTrials.length) {
    lines.push('', '## Device trials', '');
    for (const trial of report.deviceTrials)
      lines.push(
        `- ${markdown(trial.id)} / ${markdown(trial.itemId)}: ${trial.outcome}; ${trial.context}; ${trial.current ? 'current' : 'stale or removed'}; image ${trial.image?.checksum ?? 'none'}. ${markdown(trial.note)}`,
      );
  }
  if (report.inventoryScans.length) {
    lines.push('', '## Inventory photo observations', '');
    for (const scan of report.inventoryScans) {
      lines.push(
        `- ${markdown(scan.id)}: ${scan.scene}; ${scan.context}; ${scan.proposals} suggestions, ${scan.pending} pending; photo checksum ${scan.image.checksum}. ${markdown(scan.summary)}`,
      );
      for (const resolution of scan.resolutions)
        lines.push(
          `  - ${markdown(resolution.proposalId)}: ${resolution.action}${resolution.item ? ` as ${markdown(resolution.item.id)}; capabilities owner-declared` : ''}. ${markdown(resolution.ownerNote)}`,
        );
      lines.push('', markdown(scan.boundary), '');
    }
  }
  return lines.join('\n') + '\n';
}
