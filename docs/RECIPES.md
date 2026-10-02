# Recipe extension contract

A recipe states a goal, required roles, alternatives, build steps, acceptance procedures, and limits. `core/recipe-schema.ts` is the executable contract. [The scanner example](../examples/document-scanner.json) is a complete recipe.

## Requirements

Each requirement declares an ID, label, quantity, explanation, and one or more alternative match rules. A match requires all listed capabilities, an optional allowed item kind, and any explicit minimum dimensions. All dimensions are in millimetres.

The planner allocates units without sharing them between simultaneous roles. Requirements with fewer candidates are explored first. Candidate ordering favors specialized parts to preserve versatile ones. Backtracking finds the greatest number of satisfied units under the provided capability and dimension rules; it does not optimize geometry, strength, cost, or electrical compatibility.

Recipe limits: 10 requirement roles, 20 total units, four alternative rules per role, 15 steps, and 10 acceptance checks. The search fails explicitly if its state limit is exceeded.

## Instructions and acceptance

Every step references at least one declared requirement ID and includes a check. Acceptance checks require a procedure and an evidence kind: observation, measurement, or capture. At least one boundary statement is required. Unique identifiers and valid references are checked on import.

A capture check can specify `minArtifacts` (1–20). Passing it requires that many distinct original images attached to the current build and attributed to an allocated camera. Derivatives of the same original count once. Other check types cannot specify this field. See [the image evidence rules](CAMERA.md).

`minCaptureSpanMs` (1–86,400,000) requires a capture check with at least two originals. They must have ordered elapsed-time metadata from one sequence and device, spanning at least that many milliseconds. Wall-clock labels alone do not satisfy this timing contract. The starter time-lapse recipe requires a span of at least 100 ms and an owner check against the intended observation interval.

Model proposals are stamped `source: generated` and `reviewed: false`. A complete allocation remains `draft` until the recipe has been reviewed. Review must check that the prose does not introduce undeclared parts or invented physical specifications. After that review, explicitly set `reviewed: true` in the recipe to allow a build session. This flag is a user statement, not independent certification.

Recipe data never executes commands. Names and prose are not a permission channel. A syntactically valid recipe can still be physically incorrect; review the procedure and perform the defined checks with real parts.

Portfolio-generated recipes can include an `ai` provenance object with the goal, model names, input inventory fingerprint, reasoning, proposed new use, physical assumptions, and resource-review state/issues. These remain model and owner claims, not attestation. Workspace and bundle exports retain this data. The portfolio's action-capability contracts apply during concept generation; imported recipe prose still requires owner review. See [the AI engine](AI.md).

## Physical contribution requirements

Contributions should include the actual inventory, measurements, failed substitutions, procedure revisions, and observed acceptance results. Do not submit private photographs or identify other people without their agreement. Document whether results are user-reported or independently repeated. Do not convert a successful software allocation into a claim that a physical build succeeded.
