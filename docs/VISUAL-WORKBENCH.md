# The visual workbench

Run Node.js 22.12 or newer, install with `npm ci`, then start `npm run serve`. Open `http://127.0.0.1:4317`. The command builds the interface and starts the loopback server. The browser uses the same constrained planner, build ledger, image bindings, owner-review rules, and portable bundles as the core library. No model or camera is contacted at startup.

## From parts to a build

The first visit shows an explicitly labeled demo inventory. Toggle a part's availability or use **Remove a part** to see changed role assignments and missing resources. Type a goal to rank starter procedures. The map describes allocation, not assembly geometry, mounting fit, or a dimensioned fabrication plan. On small screens, its region scrolls horizontally to keep labels readable.

Use **Start with my own parts** to replace the current workspace with an empty one. Export first if you want to retain the old builds. Declare names, quantities, functions, availability, notes, and any actual measured dimensions. Editing a declaration clears tested-function claims; changing inventory makes earlier build records stale. Do not copy demo measurements into a real inventory without measuring the objects.

Select a procedure and start a build. Record steps and acceptance observations. A capture pass requires attached originals from an allocated camera and any required count/time span. Crops retain their parent and cannot masquerade as distinct originals. A matched inventory, completed step, or owner-reported pass is not independent physical validation.

## AI ideas and photo suggestions

Configure the server using `.env.example` and [the AI guide](AI.md), then restart it. Keys stay on the server. The browser shows the configured model and whether the endpoint is local or remote. **Invent with AI** explicitly sends the goal and declared inventory for generation and critique. Up to three returned ideas retain reasoning, assumptions, allocations, resource issues, and provenance as drafts. Review the procedure and acknowledge unresolved/incomplete resource review before starting a generated build.

**Stop request** aborts the browser request and propagates cancellation to active provider dispatch. No subsequent provider dispatch starts after the server observes disconnection. Already dispatched provider calls may have been processed or billed; stopping cannot undo them. If saving finds a newer browser revision, it refuses the overwrite.

Evidence includes optional photo-assisted inventory. Select a PNG or JPEG up to 6 MB, then explicitly request suggestions from the configured vision model. Source photos remain visible beside the proposed objects. Review identity, quantity, functions, and measurements against the physical objects; accept a new declaration, explicitly replace an existing ID, or reject the proposal. Counts are not merged automatically and accepted photos never establish tested capabilities. Real recognition accuracy remains unmeasured.

## Camera Lab

Start a current build that allocates a camera. Open a browser camera explicitly, select the corresponding inventory device, and confirm the source association before capturing or importing an image. Browser device labels do not authenticate hardware identity. The preview requests no microphone. Closing the camera, leaving Camera Lab, hiding the tab, or leaving the page releases the source; a late grant is handled by the camera library.

Capture originals, import existing PNG/JPEG images, or record a bounded foreground sequence. Each build image can also be downloaded directly as its saved PNG/JPEG. Sequences retain actual timing and skip overdue slots. Stopping retains already saved frames. Use four draggable corners or keyboard-accessible numeric pixel coordinates to correct perspective; the corrected image stays tied to its original and build revision. Large corrections run on the browser thread and can briefly occupy it.

A standalone frame trial opens a selected camera, records one decodable frame, and closes the source. Its original image is shown for review. Applying the result requires explicit owner association and matching bytes/current device configuration; it marks only the camera frame function tested. It does not establish optics, mounting, scene authenticity, or independent hardware identity.

## Local storage and recovery

Metadata and photos live in separate IndexedDB stores in this browser profile at this exact origin. Changing the port, hostname, browser, or profile creates a different storage scope. The UI is separate from the CLI's `.scrapmind` directory; transfer explicitly with a workspace or evidence bundle.

Metadata writes compare revisions. A stale tab cannot silently overwrite another tab. A failed metadata save retains the proposed workspace in memory and offers **Download unsaved work**, including its referenced photos. Download that recovery bundle, then reload before deciding what to restore. Unavailable or damaged metadata storage falls back to a clearly identified temporary session without overwriting the saved database. Image operations require working image storage. Form entries survive operation errors and rerenders within the session.

A **full evidence bundle** verifies and includes all referenced image bytes. A metadata-only export omits photos. Import validates schemas, image references, and all bundle checksums before replacing the current workspace. Metadata and images are stored separately, so storage failure can leave unreferenced image bytes; the last committed workspace remains intact. The report identifies stale records and missing/changed/unreadable image bytes.

Export before clearing browser storage. Bundles contain private inventories and photos; they are not uploaded automatically. This is a single-owner loopback application, not remote phone pairing or a public multi-user service.

## Executed validation

`npm run test:web` exercises the actual interface in Chromium: inventory replanning, retained build progress/reload, camera capture, perspective lineage, timed frames, bundle export, conflicting-tab refusal, stale status, escaped text, form recovery, narrow layouts, reduced motion, explicit AI generation, draft review, photo input, and owner-declaration simulation. Camera input and model responses are explicitly synthetic. These are software/UI checks, not a physical build or live recognition benchmark. Use `SCRAPMIND_CHROME_EXECUTABLE` to select an already installed Chromium browser; CI installs its test browser.
