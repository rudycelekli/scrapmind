import type { Plan, InventoryItem } from '../core/schema.js';

/** All inventory, model, imported, and user text is escaped before entering HTML or SVG. */
export function escape(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
}
const symbols: Record<string, string> = {
  device: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M10 17h4"/>',
  material: '<path d="m3 8 9-5 9 5-9 5-9-5Zm0 0v8l9 5 9-5V8M12 13v8"/>',
  tool: '<path d="M14 5a5 5 0 0 0-6 6L3 16a3 3 0 0 0 5 5l5-5a5 5 0 0 0 6-6l-3 3-5-5 3-3Z"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  camera: '<path d="M3 7h4l2-3h6l2 3h4v13H3V7Z"/><circle cx="12" cy="13" r="4"/>',
  bench: '<path d="M3 7h18v5H3zM6 12v8m12-8v8M9 3v4m6-4v4"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
};
export function icon(name: string): string {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[name] ?? symbols.material}</svg>`;
}
export function roleMap(plan: Plan, items: InventoryItem[]): string {
  const height = Math.max(310, 85 + plan.recipe.requirements.length * 63);
  const trim = (text: string, length: number) =>
    escape(text.length > length ? text.slice(0, length - 1) + '…' : text);
  const rows = plan.recipe.requirements
    .map((requirement, index) => {
      const allocated = plan.allocations.filter((entry) => entry.requirementId === requirement.id);
      const names = allocated.map(
        (entry) =>
          `${entry.quantity > 1 ? entry.quantity + ' × ' : ''}${items.find((item) => item.id === entry.itemId)?.name ?? entry.itemId}`,
      );
      const missing = plan.missing.find((entry) => entry.requirement.id === requirement.id);
      const y = 62 + index * 63;
      return `<g class="map-row${missing ? ' missing' : ''}">
      <rect x="26" y="${y}" width="264" height="43" rx="3"/><text class="map-name" x="44" y="${y + 26}">${trim(names.join(' + ') || 'Part needed', 30)}</text>
      <path class="map-line" d="M291 ${y + 21}H416"/><circle class="map-joint" cx="350" cy="${y + 21}" r="4"/>
      <text class="map-number" x="446" y="${y + 17}">${String(index + 1).padStart(2, '0')}</text>
      <text class="map-role" x="478" y="${y + 18}">${trim(requirement.label, 29)}</text>
      <text class="map-cap" x="478" y="${y + 36}">${trim(missing ? 'Missing ' + missing.quantity + ' unit(s)' : allocated.flatMap((entry) => entry.matchedCapabilities).join(' · '), 38)}</text>
    </g>`;
    })
    .join('');
  return `<svg class="role-map" viewBox="0 0 760 ${height}" role="img" aria-labelledby="role-map-title role-map-desc"><title id="role-map-title">Parts assigned to ${escape(plan.recipe.title)}</title><desc id="role-map-desc">Allocation diagram, not a dimensioned assembly. The full assignments and missing roles are listed below.</desc><text class="map-column" x="26" y="27">YOUR PARTS</text><text class="map-column" x="446" y="27">THEIR NEW JOBS</text>${rows}</svg>`;
}
