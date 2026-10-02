import type { z } from 'zod';
import type { photoObservationsSchema } from '../core/inventory-scan.js';

/** Synthetic protocol data. No model interpreted these pixels or identified real objects. */
export function photoObservationFixture(): z.infer<typeof photoObservationsSchema> {
  return {
    scene: 'workshop-objects',
    summary: 'Synthetic candidate observations for testing owner review.',
    candidates: [
      {
        label: 'Possible clamp',
        kind: 'tool',
        countEstimate: 2,
        visibleFeatures: 'The synthetic response describes a jaw-like outline.',
        region: { left: 0.1, top: 0.1, right: 0.5, bottom: 0.5 },
        capabilitySuggestions: [
          {
            capability: 'clamp',
            why: 'The proposed shape resembles a gripping tool.',
            ownerCheck:
              'Inspect the actual tool and check its opening, gripping function and working condition.',
          },
        ],
        uncertainties: [
          'Identity, actual quantity, fit, gripping force, and working condition are not established.',
        ],
        possibleExistingItemIds: ['clamp'],
      },
      {
        label: 'Unidentified object',
        kind: null,
        countEstimate: 1,
        visibleFeatures: 'An indistinct region in a synthetic response.',
        region: null,
        capabilitySuggestions: [],
        uncertainties: ['Identity and all usable functions are unknown.'],
        possibleExistingItemIds: [],
      },
    ],
    questionsForOwner: [
      'Which objects are already in inventory?',
      'Confirm actual identities, counts, functions and any measurements you enter.',
    ],
  };
}
