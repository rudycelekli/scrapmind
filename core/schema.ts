import { z } from 'zod';

export const capabilities = [
  'camera',
  'compute',
  'display',
  'light',
  'stable-base',
  'vertical-support',
  'clamp',
  'fastener',
  'adhesive',
  'flat-panel',
  'soft-grip',
  'rotation',
  'diffuser',
  'measure',
  'cut',
  'usb-power',
  'network',
  'microphone',
] as const;
export const capabilitySchema = z.enum(capabilities);
export type Capability = z.infer<typeof capabilitySchema>;

export const itemSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().trim().min(1).max(100),
    kind: z.enum(['material', 'device', 'tool']),
    quantity: z.number().int().min(1).max(10000),
    available: z.boolean(),
    capabilities: z.array(capabilitySchema).min(1).max(capabilities.length),
    testedCapabilities: z.array(capabilitySchema).default([]),
    dimensions: z
      .object({
        length: z.number().positive().max(100000).optional(),
        width: z.number().positive().max(100000).optional(),
        height: z.number().positive().max(100000).optional(),
      })
      .strict()
      .optional(),
    evidence: z.enum(['declared', 'observed', 'tested']).default('declared'),
    notes: z.string().max(2000).default(''),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (new Set(item.capabilities).size !== item.capabilities.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Capabilities must be unique',
        path: ['capabilities'],
      });
    }
    if (
      new Set(item.testedCapabilities).size !== item.testedCapabilities.length ||
      item.testedCapabilities.some((c) => !item.capabilities.includes(c))
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Tested capabilities must be a unique subset of declared capabilities',
        path: ['testedCapabilities'],
      });
    }
    if (item.evidence === 'tested' && item.testedCapabilities.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Tested evidence requires at least one tested capability',
        path: ['testedCapabilities'],
      });
    }
  });
export type InventoryItem = z.infer<typeof itemSchema>;

export const inventorySchema = z
  .array(itemSchema)
  .max(250)
  .superRefine((items, ctx) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item.id))
        ctx.addIssue({
          code: 'custom',
          message: 'Inventory item IDs must be unique',
          path: [index, 'id'],
        });
      seen.add(item.id);
    });
  });

export interface MatchRule {
  capabilities: Capability[];
  kinds?: InventoryItem['kind'][];
  minDimensions?: Partial<Record<'length' | 'width' | 'height', number>>;
}
export interface Requirement {
  id: string;
  label: string;
  quantity: number;
  alternatives: MatchRule[];
  explanation: string;
}
export interface BuildStep {
  id: string;
  title: string;
  instruction: string;
  requirements: string[];
  check: string;
}
export interface AcceptanceCheck {
  id: string;
  label: string;
  procedure: string;
  evidenceKind: 'observation' | 'measurement' | 'capture';
  minArtifacts?: number;
}
export interface Recipe {
  id: string;
  title: string;
  subtitle: string;
  category: 'fabrication' | 'alchemy';
  goalTerms: string[];
  minutes: number;
  difficulty: 'Easy' | 'Moderate';
  visual: 'scanner' | 'stand' | 'lightbox' | 'timelapse' | 'turntable';
  requirements: Requirement[];
  steps: BuildStep[];
  checks: AcceptanceCheck[];
  boundaries: string[];
  source?: 'starter' | 'generated' | 'imported';
  reviewed?: boolean;
}
export interface Allocation {
  requirementId: string;
  itemId: string;
  quantity: number;
  matchedCapabilities: Capability[];
}
export interface Plan {
  recipe: Recipe;
  allocations: Allocation[];
  missing: { requirement: Requirement; quantity: number }[];
  status: 'ready' | 'blocked' | 'draft';
  coveredUnits: number;
  totalUnits: number;
  relevance: number;
  evidence: 'declared' | 'observed' | 'tested';
  untestedCapabilities: { itemId: string; capability: Capability }[];
  inventoryFingerprint: string;
  recipeFingerprint: string;
}

export function parseInventory(input: unknown): InventoryItem[] {
  return inventorySchema.parse(input);
}

export function inventoryFingerprint(items: InventoryItem[]): string {
  // Store the canonical input rather than a lossy hash: stale-build checks must
  // distinguish every relevant input change, and must work without async crypto.
  return JSON.stringify(
    [...items]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((item) => ({
        ...item,
        capabilities: [...item.capabilities].sort(),
        testedCapabilities: [...item.testedCapabilities].sort(),
      })),
  );
}
