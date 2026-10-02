import type { InventionConcept } from '../core/ideation.js';

/** Explicitly synthetic protocol fixture. Not a model benchmark or physical trial. */
export function conceptFixture(): InventionConcept {
  return {
    title: 'Shadow comparison station',
    purpose: 'Compare shadows of owner-supplied small objects under repeatable framing.',
    reasoning:
      'A camera records a surface illuminated by a movable lamp. Comparable captures may reveal changes in shadow shape.',
    newUse: 'A proposed comparison workflow, not an established novel invention.',
    category: 'alchemy',
    minutes: 20,
    difficulty: 'Moderate',
    visual: 'lightbox',
    roles: [
      {
        label: 'Camera',
        explanation: 'Records the comparison surface.',
        quantity: 1,
        capabilities: ['camera'],
        kinds: ['device'],
      },
      {
        label: 'Light source',
        explanation: 'Illuminates the comparison surface.',
        quantity: 1,
        capabilities: ['light'],
        kinds: ['device'],
      },
      {
        label: 'Surface',
        explanation: 'A surface for owner-supplied test objects.',
        quantity: 1,
        capabilities: ['flat-panel'],
        kinds: ['material'],
      },
    ],
    steps: [
      {
        title: 'Lay out',
        instruction:
          'Arrange the camera, light source, and surface on the existing desk. The owner must supply the test objects.',
        action: 'arrange',
        targetRole: 2,
        roles: [0, 1, 2],
        check:
          'Confirm that the camera can frame the surface without attaching unsupported mounts.',
      },
      {
        title: 'Illuminate',
        instruction:
          'Manually position the light source to illuminate the surface; inspect shadows before continuing.',
        action: 'illuminate',
        targetRole: 1,
        roles: [1, 2],
        check: 'Confirm that shadows can be distinguished on the surface.',
      },
      {
        title: 'Capture',
        instruction:
          'Record the surface with the camera while the owner compares the test objects.',
        action: 'capture',
        targetRole: 0,
        roles: [0, 2],
        check: 'Inspect the recorded image for visible shadows and framing.',
      },
    ],
    checks: [
      {
        label: 'Framing',
        procedure:
          'Inspect whether the surface and shadows are visible in a recorded image. Record any missing detail.',
        evidenceKind: 'capture',
      },
      {
        label: 'Repeatability',
        procedure:
          'Repeat an owner-supplied object position and compare the resulting shadow manually; record what changed.',
        evidenceKind: 'observation',
      },
    ],
    assumptionsToTest: [
      'The camera frames the surface without an additional mount.',
      'Illumination and surface contrast permit a visible shadow.',
    ],
    boundaries: [
      'Owner supplies the comparison objects and an existing desk; no geometric accuracy is established.',
    ],
  };
}
