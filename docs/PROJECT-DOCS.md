# Project Docs

## Project classification

- Project type: browser extension
- Current phase: early implementation with partial feature scaffolding
- Primary surface: Chrome side panel for tab-group and tab-state management
- Delivery style: single-repo public-safe implementation docs

## Decision boundary

This doc pack is meant to make the next implementation passes safer by:

- clarifying what the extension is trying to do now
- separating live browser state from persisted saved state
- preserving traceability between feature intent, architecture, and execution slices

## Confirmed facts

- The extension is built with Manifest V3, Vite, React, and TypeScript.
- The manifest requests `sidePanel`, `tabs`, `activeTab`, `tabGroups`, `storage`, `topSites`, and `bookmarks`.
- The side panel currently exposes three tabs:
  - `Sync` / live tab and group view
  - `Note`
  - `Group`
- The app already contains a sync-storage layer and a migration system.
- Module-level design notes already exist for storage and migrations.

## Working assumptions

- The `Live` view is intended to reflect the browser's current tab and group state.
- The `Group` view is intended to reflect user-managed persisted saved-group snapshots backed by sync storage.
- The `Note` tab is placeholder-only today.

## Product promise

`crx-tab-groups` treats a saved group as a **persisted snapshot of a tab group that the user can review now and restore later**.

This means:

- the `Live` tab shows current browser state
- the `Group` tab shows saved snapshots
- the project is **not** promising two-way synchronization between live groups and saved groups
- live browser changes should not silently rewrite saved snapshots

## Open questions

- What explicit user actions should create, update, delete, or restore a saved snapshot?
- What behavior should happen when a persisted tab cannot be reopened or has stale metadata?
- What user-facing role should bookmarks and top sites play in the saved-group workflow?

## Recommended document pack

For this project, the minimum coherent pack is:

- problem and feature snapshot
- functional requirements
- use cases and user flows
- architecture summary
- delivery handoff

A separate heavy BRD or SRS is not justified yet. The project is better served by a compact implementation-facing pack.

## Product snapshot

`crx-tab-groups` is a Chrome extension that helps users inspect live tab groups in the current browser and manage a persisted representation of saved groups and tabs through Chrome sync storage.

The product should reduce friction around:

- seeing current grouped and ungrouped tabs
- saving group snapshots beyond one immediate browser moment
- reviewing saved snapshots separately from live browser state
- restoring saved snapshots later without implying continuous sync
- evolving storage safely as the data model changes

## Primary actors

- Primary actor: browser user managing many tabs and groups
- Secondary actor: future maintainer extending extension behavior and storage schema

## Scope

### In scope now

- side panel navigation
- live group and tab inspection
- persisted sync-storage model for saved-group snapshots, tabs, and favicons
- migration safety for schema changes
- closing live groups from the live view

### Out of scope for now

- multi-user collaboration
- cloud backend outside Chrome storage
- heavy analytics or history tracking
- complex bookmark-management workflows

## Functional requirements

### FR-1 Live browser state visibility

The extension shall read the current browser tab and tab-group state and present:

- pinned tabs
- grouped tabs grouped by live Chrome tab group
- ungrouped tabs

### FR-2 Persisted group view

The extension shall read persisted saved-group and tab entities from sync storage and render each saved snapshot with its saved tabs.

### FR-2a Saved-state boundary

The extension shall keep the persisted saved-group model separate from the live Chrome tab-group state unless the user invokes an explicit saved-group action.

### FR-3 Storage schema versioning

The extension shall version persisted storage data and run sequential migrations before the main UI relies on that data.

### FR-4 Favicon persistence

The extension shall collect and persist favicon metadata keyed by extracted domain when available.

### FR-5 Group close action

The extension shall let the user close all tabs in a selected live group from the live view.

## Use cases

### UC-1 Inspect live groups

- Actor: browser user
- Trigger: open side panel
- Main flow:
  - extension initializes
  - migration check completes
  - extension reads current tab groups and tabs
  - UI renders pinned, grouped, and ungrouped tabs
- Outcome: user understands current browser grouping state

### UC-2 Review saved groups

- Actor: browser user
- Trigger: switch to `Group` tab
- Main flow:
  - extension reads persisted saved-group snapshots and tabs from sync storage
  - UI joins tabs to groups in memory
  - UI renders expandable saved snapshots
- Outcome: user sees the saved model independently of current live state and understands it as a later-restore surface rather than a live mirror

### UC-3 Apply schema migration

- Actor: system
- Trigger: app startup with old stored version
- Main flow:
  - extension checks stored version
  - migration engine runs registered steps in order
  - updated data is written back
  - main UI continues after migration finishes
- Outcome: storage shape matches current code expectations

## User flows

### Flow A: side panel startup

1. User opens extension side panel.
2. Side panel shows migration state while storage upgrade runs.
3. App enters the main layout after migration completes.
4. User lands on the default tab.

### Flow B: inspect live state

1. User stays in the live view.
2. Extension queries Chrome tabs and tab groups.
3. Extension groups tabs into pinned, grouped, and ungrouped sections.
4. User expands or collapses sections and can close a live group.

### Flow C: inspect persisted groups

1. User switches to the group-management tab.
2. Extension reads stored groups and stored tabs.
3. Extension builds an in-memory joined representation.
4. User expands saved snapshots and reviews stored tabs.

## Risks and gaps

- Several storage methods still note missing error handling.
- Current write flows use read-modify-write without locking, which risks races.
- The saved-snapshot workflow is only partially realized at the UI level.
- `package.json` and manifest metadata are still thin, which weakens release-facing clarity.

## Next handoff

Use [ARCHITECTURE.md](./ARCHITECTURE.md) as the design summary and [DELIVERY-HANDOFF.md](./DELIVERY-HANDOFF.md) as the execution map from these requirements into implementation slices.
