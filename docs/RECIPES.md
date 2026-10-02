# Recipe extension contract

A recipe states a goal, required roles, alternatives, build steps, acceptance procedures, and limits. `core/recipe-schema.ts` is the executable contract. [The scanner example](../examples/document-scanner.json) is a complete recipe.

## Requirements

Each requirement declares an ID, label, quantity, explanation, and one or more alternative match rules. A match requires all listed capabilities, an optional allowed item kind, and any explicit minimum dimensions. All dimensions are in millimetres.

The planner allocates units without sharing them between simultaneous roles. Requirements with fewer candidates are explored first. Candidate ordering favors specialized parts to preserve versatile ones. Backtracking finds the greatest number of satisfied units under the provided capability and dimension rules; it does not optimize geometry, strength, cost, or electrical compatibility.

Recipe limits: 10 requirement roles, 20 total units, four alternative rules per role, 15 steps, and 10 acceptance checks. The search fails explicitly if its state limit is exceeded.

## Instructions and acceptance

Every step references at least one declared requirement ID and includes a check. Acceptance checks require a procedure and an evidence kind: observation, measurement, or capture. At least one boundary statement is required. Unique identifiers and valid references are checked on import.

Model proposals are stamped `source: generated` and `reviewed: false`. A complete allocation remains `draft` until the recipe has been reviewed. Review must check that the prose does not introduce undeclared parts or invented physical specifications. After that review, explicitly set `reviewed: true` in the recipe to allow a build session. This flag is a user statement, not independent certification.

Recipe data never executes commands. Names and prose are not a permission channel. A syntactically valid recipe can still be physically incorrect; review the procedure and perform the defined checks with real parts.

## Physical contribution requirements

Contributions should include the actual inventory, measurements, failed substitutions, procedure revisions, and observed acceptance results. Do not submit private photographs or identify other people without their agreement. Document whether results are user-reported or independently repeated. Do not convert a successful software allocation into a claim that a physical build succeeded.
