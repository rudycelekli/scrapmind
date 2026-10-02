import type { AcceptanceCheck, BuildStep, MatchRule, Recipe, Requirement } from './schema.js';

const requirement = (
  id: string,
  label: string,
  explanation: string,
  alternatives: MatchRule[],
  quantity = 1,
): Requirement => ({ id, label, explanation, alternatives, quantity });
const step = (
  id: string,
  title: string,
  instruction: string,
  requirements: string[],
  check: string,
): BuildStep => ({ id, title, instruction, requirements, check });
const check = (
  id: string,
  label: string,
  procedure: string,
  evidenceKind: AcceptanceCheck['evidenceKind'] = 'observation',
): AcceptanceCheck => ({ id, label, procedure, evidenceKind });
const camera = requirement('camera', 'Image source', 'A working camera becomes the image sensor.', [
  { capabilities: ['camera'], kinds: ['device'] },
]);
const host = requirement(
  'host',
  'Browser host',
  'Runs the capture and image tools. A separate phone camera needs a supported connection or its own browser session.',
  [{ capabilities: ['compute', 'display'], kinds: ['device'] }],
);
const support = requirement(
  'support',
  'Vertical support',
  'Holds the image source above the work area. Shape, mounting geometry, and stability require inspection.',
  [{ capabilities: ['vertical-support'] }],
);
const grip = requirement(
  'grip',
  'Camera grip',
  'Positions the camera. Test the grip with the actual device before releasing it.',
  [{ capabilities: ['clamp'] }],
);
const base = requirement(
  'base',
  'Flat work surface',
  'A declared surface at least 220 × 160 mm; larger documents may require a larger surface.',
  [{ capabilities: ['flat-panel'], minDimensions: { length: 220, width: 160 } }],
);
const cameraChecks = [
  check(
    'frame',
    'The work area fits in the frame',
    'Capture a sample with all four corners of the intended subject visible.',
    'capture',
  ),
  check(
    'stability',
    'The mount stays in position',
    'With the actual device secured, observe the frame for 30 seconds. Record any drift or movement. This is a local observation, not load certification.',
  ),
];
const cameraSteps = [
  step(
    'inspect',
    'Check the parts',
    'Inspect the support and grip. Confirm the actual camera can attach without blocking its lens or controls. Stop if the geometry does not fit.',
    ['camera', 'support', 'grip'],
    'The device fits the intended mounting position.',
  ),
  step(
    'surface',
    'Prepare the work area',
    'Place the flat work surface on a stable table. Put the intended subject on it and confirm its footprint fits.',
    ['base'],
    'The subject fits without hanging off the work surface.',
  ),
  step(
    'mount',
    'Position the camera',
    'Position the camera above the subject using the support and grip. Keep the device held until you have confirmed the mounting method is stable.',
    ['camera', 'support', 'grip'],
    'The camera faces the subject and remains in position.',
  ),
  step(
    'connect',
    'Connect the image source',
    'Connect the webcam to its host or use the old phone’s existing camera app. SCRAPMIND Camera Lab is planned; use existing capture software in this alpha. Remote phone pairing is a separate capability.',
    ['camera', 'host'],
    'Your existing camera software shows a real live preview.',
  ),
];

export const recipes: Recipe[] = [
  {
    id: 'document-scanner',
    title: 'Document scanner',
    subtitle: 'An old camera, a few parts, a useful new instrument.',
    category: 'alchemy',
    goalTerms: ['scan', 'scanner', 'document', 'documents', 'paper', 'digitize', 'page'],
    minutes: 15,
    difficulty: 'Easy',
    visual: 'scanner',
    requirements: [camera, host, support, grip, base],
    steps: [
      ...cameraSteps,
      step(
        'capture',
        'Make the first scan',
        'Use your existing camera software to capture a page. Crop and straighten in an image tool if needed, then inspect the smallest text. The integrated SCRAPMIND capture interface is planned.',
        ['camera', 'host'],
        'The saved image contains readable text and the full page.',
      ),
    ],
    checks: [
      ...cameraChecks,
      check(
        'readability',
        'Small text is readable',
        'Inspect the exported image at full resolution. Read a sample of the smallest text and record the result.',
        'capture',
      ),
    ],
    boundaries: [
      'Part matching establishes a candidate configuration, not mechanical compatibility.',
      'Camera quality, mounting fit, lighting, and document size must be checked with the actual parts.',
      'No automatic OCR or remote phone discovery is claimed.',
    ],
  },
  {
    id: 'inspection-station',
    title: 'Inspection station',
    subtitle: 'Give a spare camera a closer look at your work.',
    category: 'alchemy',
    goalTerms: ['inspect', 'inspection', 'camera', 'close', 'detail', 'electronics', 'magnify'],
    minutes: 12,
    difficulty: 'Easy',
    visual: 'scanner',
    requirements: [
      camera,
      host,
      support,
      grip,
      requirement('light', 'Task light', 'Illuminates the subject from outside the capture area.', [
        { capabilities: ['light'], kinds: ['device'] },
      ]),
    ],
    steps: [
      cameraSteps[0],
      cameraSteps[2],
      cameraSteps[3],
      step(
        'light',
        'Light the subject',
        'Place the light to one side. Adjust its position until details are visible without glare. Keep hot lights away from materials.',
        ['light'],
        'The target detail is visible without reflection hiding it.',
      ),
      step(
        'inspect-detail',
        'Capture the target detail',
        'Choose a small feature of known size and capture it. Enlarge the saved image to check whether it is resolved. Enlarging pixels does not add optical detail.',
        ['camera', 'host'],
        'The chosen feature can be distinguished in the captured image.',
      ),
    ],
    checks: [
      cameraChecks[1],
      check(
        'detail',
        'The target detail is resolved',
        'Record the feature size if known and save a capture showing it. Do not claim magnification or resolution without measurement.',
        'capture',
      ),
    ],
    boundaries: [
      'This is a camera inspection aid, not a microscope or electrical diagnosis.',
      'Actual focus distance and optical resolution determine useful detail.',
    ],
  },
  {
    id: 'phone-stand',
    title: 'Phone stand',
    subtitle: 'A small useful object from an offcut and a support.',
    category: 'fabrication',
    goalTerms: ['phone', 'stand', 'holder', 'desk', 'support'],
    minutes: 10,
    difficulty: 'Easy',
    visual: 'stand',
    requirements: [
      requirement(
        'base',
        'Flat base',
        'Provides the footprint. Verify balance with the intended phone.',
        [{ capabilities: ['flat-panel'], minDimensions: { length: 100, width: 80 } }],
      ),
      support,
      requirement('grip', 'Positioning grip', 'Secures the support to the base.', [
        { capabilities: ['clamp'] },
        { capabilities: ['adhesive'] },
      ]),
      requirement('liner', 'Soft contact surface', 'Protects the phone contact points.', [
        { capabilities: ['soft-grip'] },
        { capabilities: ['diffuser'] },
      ]),
    ],
    steps: [
      step(
        'layout',
        'Find the geometry',
        'Position the support on the base. Hold your phone against it and choose a viewing angle. No angle or cut is inferred from undeclared dimensions.',
        ['base', 'support'],
        'The phone fits the proposed contact area.',
      ),
      step(
        'join',
        'Fix the position',
        'Use the grip or temporary adhesive to keep the parts aligned. Add the soft material where the phone touches the stand.',
        ['grip', 'liner'],
        'The surfaces stay aligned while you keep a hand on the phone.',
      ),
      step(
        'trial',
        'Try the actual phone',
        'On a clear table, place the phone and observe whether it slides or tips during normal viewing. Revise the geometry if it moves.',
        ['base', 'support', 'liner'],
        'The phone stays in position during the observed trial.',
      ),
    ],
    checks: [
      check(
        'fit',
        'The intended phone fits',
        'Record phone size and an observation of contact at the intended angle.',
        'measurement',
      ),
      check(
        'balance',
        'No sliding or tipping in the trial',
        'Observe the actual phone for 30 seconds on the intended surface. Record any movement.',
      ),
    ],
    boundaries: [
      'No load rating or unattended stability is certified.',
      'This first recipe provides a candidate layout and trial procedure, not a dimensioned fabrication drawing.',
    ],
  },
  {
    id: 'light-box',
    title: 'Photo light box',
    subtitle: 'Turn a spare light and fabric into softer product photos.',
    category: 'alchemy',
    goalTerms: ['photo', 'photograph', 'product', 'light', 'box', 'lighting', 'studio'],
    minutes: 20,
    difficulty: 'Easy',
    visual: 'lightbox',
    requirements: [
      camera,
      host,
      requirement(
        'body',
        'Box or flat panels',
        'Creates a backdrop or enclosure; inspect the actual geometry.',
        [{ capabilities: ['flat-panel'], minDimensions: { length: 220, width: 160 } }],
      ),
      requirement('light', 'External light', 'Illuminate from outside the enclosure.', [
        { capabilities: ['light'], kinds: ['device'] },
      ]),
      requirement(
        'diffuser',
        'Diffusing material',
        'Softens light when positioned appropriately.',
        [{ capabilities: ['diffuser'] }],
      ),
      requirement('grip', 'Positioning attachment', 'Keeps the backdrop or diffuser positioned.', [
        { capabilities: ['adhesive'] },
        { capabilities: ['clamp'] },
      ]),
    ],
    steps: [
      step(
        'backdrop',
        'Prepare the backdrop',
        'Arrange the box or panels around a small object to create a continuous background where possible.',
        ['body'],
        'The object fits and the background is visible.',
      ),
      step(
        'diffuse',
        'Place the diffuser',
        'Position the fabric between an external light and the subject. Keep fabric away from the lamp and its ventilation.',
        ['light', 'diffuser', 'grip'],
        'The material remains clear of the light and the subject is evenly illuminated.',
      ),
      step(
        'compare',
        'Compare the photos',
        'Capture the same object with and without diffusion. Keep camera position and exposure consistent where possible.',
        ['camera', 'host'],
        'The comparison captures show the actual effect on shadows and glare.',
      ),
    ],
    checks: [
      check(
        'comparison',
        'A before-and-after comparison exists',
        'Save both captures and describe the change in shadows and glare.',
        'capture',
      ),
      check(
        'clearance',
        'Light clearance is maintained',
        'Observe that materials remain clear of the external light and its ventilation during the trial.',
      ),
    ],
    boundaries: [
      'Light output, diffusion, and exposure need a real comparison.',
      'The plan does not establish thermal suitability of a particular lamp or fabric.',
    ],
  },
  {
    id: 'timelapse-rig',
    title: 'Time-lapse rig',
    subtitle: 'Let a forgotten camera notice change over time.',
    category: 'alchemy',
    goalTerms: ['timelapse', 'time', 'lapse', 'growth', 'plant', 'watch', 'record'],
    minutes: 15,
    difficulty: 'Easy',
    visual: 'timelapse',
    requirements: [camera, host, support, grip],
    steps: [
      cameraSteps[0],
      cameraSteps[2],
      cameraSteps[3],
      step(
        'schedule',
        'Choose the capture interval',
        'Use interval capture in your existing camera software if supported, or take manual captures at recorded times. Integrated SCRAPMIND interval capture is planned.',
        ['camera', 'host'],
        'Two sequential captures have actual timestamps and consistent framing.',
      ),
      step(
        'observe',
        'Watch the sequence',
        'Review the captured sequence and record the elapsed time. The first release exports still frames; a video encoder is not implied.',
        ['camera', 'host'],
        'The sequence covers the intended observation interval.',
      ),
    ],
    checks: [
      cameraChecks[1],
      check(
        'sequence',
        'At least two timed captures exist',
        'Save the timestamped captures and record the observed interval.',
        'capture',
      ),
    ],
    boundaries: [
      'Keep the device powered and the page active. Background scheduling is not guaranteed.',
      'Capture timestamps report actual browser time, not laboratory timing accuracy.',
    ],
  },
  {
    id: 'object-turntable',
    title: 'Object capture turntable',
    subtitle: 'A rotating base becomes a repeatable photo station.',
    category: 'alchemy',
    goalTerms: ['object', 'turntable', 'rotate', 'rotation', 'capture', '3d', 'scan'],
    minutes: 20,
    difficulty: 'Moderate',
    visual: 'turntable',
    requirements: [
      camera,
      host,
      requirement(
        'rotation',
        'Rotating base',
        'Supports manual rotation for multiple viewpoints.',
        [{ capabilities: ['rotation', 'stable-base'] }],
      ),
      support,
      grip,
      requirement('light', 'Consistent lighting', 'Helps keep the viewpoints comparable.', [
        { capabilities: ['light'], kinds: ['device'] },
      ]),
    ],
    steps: [
      cameraSteps[0],
      cameraSteps[2],
      cameraSteps[3],
      step(
        'center',
        'Center the object',
        'Put a small object at the center of the rotating base. Position the light and keep the camera fixed.',
        ['rotation', 'light'],
        'The entire object stays in frame through a full manual rotation.',
      ),
      step(
        'viewpoints',
        'Capture the viewpoints',
        'Rotate the base in consistent increments and capture each view. Export the photographs for a reconstruction tool of your choice.',
        ['camera', 'host', 'rotation'],
        'The viewpoints show overlapping features and similar exposure.',
      ),
    ],
    checks: [
      check(
        'coverage',
        'A full set of viewpoints exists',
        'Capture at least eight viewpoints around the object and inspect coverage.',
        'capture',
      ),
      check(
        'alignment',
        'Framing stays consistent',
        'Compare the first and last viewpoints for object centering and camera movement.',
      ),
    ],
    boundaries: [
      'This produces source photographs, not a reconstructed 3D model.',
      'Reflective, transparent, or textureless objects may be unsuitable for reconstruction.',
    ],
  },
];
