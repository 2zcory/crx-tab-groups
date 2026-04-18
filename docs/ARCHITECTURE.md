# Architecture

## HLD

### System objective

Provide a browser-extension side panel that separates:

- live browser tab-group state
- persisted saved group state
- schema and storage evolution concerns

### Major components

- Manifest and extension shell
  - defines permissions, side panel entry, background worker, and content script hooks
- Side panel UI
  - renders tabs, layouts, and extension-facing interactions
- Live state adapter
  - reads `chrome.tabs` and `chrome.tabGroups`
- Persisted storage layer
  - stores groups, tabs, and favicons through `chrome.storage.sync`
- Migration engine
  - upgrades stored schema to the latest version before UI depends on it

### High-level data movement

1. App loads side panel.
2. Migration engine normalizes stored data.
3. UI reads either:
   - live browser state through Chrome APIs
   - persisted group state through storage repositories
4. UI renders grouped structures and invokes user actions.
5. Some background persistence tasks update favicon storage.

### Main boundaries

- Live browser state is authoritative for the `Live` tab.
- Sync storage is authoritative for the `Group` tab.
- Migration logic owns schema compatibility.
- UI composition should not own persistence policy decisions directly.

## LLD summary

### Background layer

- File: `src/background/index.ts`
- Current job:
  - enable side panel open-on-action-click behavior
  - receive runtime messages
- Current maturity:
  - lightweight bootstrap only

### Side panel shell

- File: `src/sidepanel/main-views/SidePanel.tsx`
- Responsibilities:
  - run migrations at startup
  - gate main UI on migration completion
  - switch among `Live`, `Note`, and `Group`

### Live-management slice

- File: `src/sidepanel/main-views/live/index.tsx`
- Responsibilities:
  - query live tabs and tab groups
  - compute grouped display structure
  - render pinned, grouped, and ungrouped buckets
  - trigger close-group behavior
  - update favicon cache on a delayed timer

### Group-management slice

- File: `src/sidepanel/main-views/group-management/index.tsx`
- Responsibilities:
  - read persisted saved groups with tabs attached
  - render saved groups
- Current maturity:
  - read-only rendering path
  - obvious TODO markers remain

### Storage repositories

- Files:
  - `src/storage/core.ts`
  - `src/storage/group.sync.ts`
  - `src/storage/tab.sync.ts`
  - `src/storage/favIcon.sync.ts`
- Responsibilities:
  - typed access to sync storage
  - entity-specific create, update, delete, and joined read flows
- Existing detailed doc:
  - [../src/storage/DESIGN.md](../src/storage/DESIGN.md)

### Migration layer

- Files:
  - `src/migrations/core.ts`
  - `src/migrations/index.ts`
  - `src/migrations/sync/*`
- Responsibilities:
  - detect current schema version
  - run migrations sequentially
  - persist upgraded data after each step
- Existing detailed doc:
  - [../src/migrations/DESIGN.md](../src/migrations/DESIGN.md)

## Design decisions

### Decision 1: split live state from saved state

Reason:

- Chrome tab groups are volatile browser state.
- Persisted groups represent a product-defined model that can survive browser changes and schema upgrades.

### Decision 2: run migrations before main UI

Reason:

- UI code should not need to branch on old storage versions.
- Startup migration keeps later reads simpler and safer.

### Decision 3: keep module-level design docs close to storage and migration code

Reason:

- those modules are the most internally coupled and deserve local design notes
- project-level docs should stay thinner and act as the coordinating layer

## Current technical gaps

- No explicit synchronization policy between live Chrome groups and persisted saved groups.
- No transaction protection around sync-storage writes.
- Error handling is thin across storage and action flows.
- The `Note` surface is a placeholder.
- Background and content-script responsibilities are still minimal and may expand later.

## Recommended next technical slices

- define the saved-group lifecycle and synchronization boundary
- add guarded write or queued-write behavior for storage updates
- make live actions and saved-state actions clearly separate in the UI and code
- define restore or apply behavior for saved groups if that is part of the product promise
