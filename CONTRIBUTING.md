# Contributing

Start by reproducing `npm run demo` and running `npm run check`. Use Node.js 22.12 or newer and `npm ci` so dependencies match the lockfile.

Useful contributions include new reproducible starter recipes, physical build reports, allocation regressions, browser/device tests for the visual workbench, and clearer setup instructions. Explain the concrete problem and include the smallest useful reproduction.

New recipes must pass `recipeSchema` and include quantities, explicit required measurements, actual assembly checks, and a boundary statement. If your contribution reports a physical result, identify the tested inventory and procedure revision and include failures. Do not claim measured strength, electrical compatibility, or optical resolution without corresponding evidence.

Keep code in strict TypeScript. Use `.js` extensions for relative imports. Format with `npm run format`, then run `npm run check` and `npm run format:check`. Tests should protect observable behavior and meaningful invariants.

Submit a pull request with the change, reason, validation, and remaining limits. Do not include keys, private inventory, personal camera captures, or machine-specific paths.
