import { evaluationSuiteSchema } from './evaluation.js';
import { demoInventory } from './fixtures.js';

/** Public declared demo cases; no inventory was discovered and no device was tested. */
export function ideaEvaluationCases() {
  const items = demoInventory();
  const subset = (...ids: string[]) =>
    items.filter((item) => ids.includes(item.id)).map((item) => ({ ...item, quantity: 1 }));
  return evaluationSuiteSchema.parse([
    {
      id: 'lamp-panel',
      label: 'Two parts, no hidden fastening or camera',
      goal: 'Use only the supplied desk lamp and flat panel to illuminate the panel and manually compare its appearance under two lamp positions. Use no objects, desk, mount, fastener, measuring tool, camera, or additional resource. Keep both supplied parts as explicit roles, and make manual positioning and comparison clear. Do not invent optical accuracy or successful tests.',
      inventory: subset('lamp', 'panel'),
      requiredActions: ['illuminate', 'compare'],
      resourcePolicy: 'declared-only',
      removeItemIds: ['lamp'],
    },
    {
      id: 'camera-light-panel',
      label: 'Camera, host, light, and explicit framing evidence',
      goal: 'Propose a tabletop comparison workflow using only the supplied webcam, laptop host, lamp, and panel: illuminate the panel, use the webcam with its laptop host to capture its appearance under two lamp positions, and compare the captures manually. Declare all four supplied parts as roles, including the compute host. Do not assume mounts, fastening, sample objects, optical accuracy, or a successful test. Represent any additional required resource explicitly rather than silently introducing it.',
      inventory: subset('webcam', 'laptop', 'lamp', 'panel'),
      requiredActions: ['illuminate', 'capture', 'compare'],
      requiredAllocatedCapabilities: ['camera', 'compute', 'light', 'flat-panel'],
      resourcePolicy: 'declared-only',
      removeItemIds: ['webcam'],
    },
    {
      id: 'missing-camera',
      label: 'Honest missing camera, no imaginary capture',
      goal: 'Capture an image of the supplied illuminated panel. There is no available camera. Propose an explicitly blocked configuration that declares the missing camera role and a capture action instead of implying the lamp or panel can take pictures. Do not claim any capture happened.',
      inventory: subset('lamp', 'panel'),
      requiredActions: ['capture'],
      resourcePolicy: 'missing-allowed',
      requiredMissingCapabilities: ['camera'],
    },
    {
      id: 'single-phone',
      label: 'One multifunction device cannot be counted twice',
      goal: 'Use exactly one supplied smartphone to capture a scene and display the captured image on that same phone. These are sequential actions. Combine camera and display functions in one physical role rather than requiring two phones. The scene is unspecified; do not add objects, mounts, tools, hidden functions, accuracy claims, or successful tests.',
      inventory: subset('phone'),
      requiredActions: ['capture', 'display'],
      resourcePolicy: 'declared-only',
      removeItemIds: ['phone'],
    },
  ]);
}
