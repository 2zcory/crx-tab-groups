# Delivery Handoff

## Approved source docs

- [PROJECT-DOCS.md](./PROJECT-DOCS.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [../src/storage/DESIGN.md](../src/storage/DESIGN.md)
- [../src/migrations/DESIGN.md](../src/migrations/DESIGN.md)

## Traceability map

### Requirement to implementation area

- FR-1 Live browser state visibility
  - `src/sidepanel/main-views/live/index.tsx`
  - `src/listeners/*`
  - `src/components/ui/*`
- FR-2 Persisted group view
  - `src/sidepanel/main-views/group-management/index.tsx`
  - `src/storage/group.sync.ts`
  - `src/storage/tab.sync.ts`
- FR-3 Storage schema versioning
  - `src/migrations/*`
  - `src/sidepanel/main-views/SidePanel.tsx`
- FR-4 Favicon persistence
  - `src/storage/favIcon.sync.ts`
  - `src/sidepanel/main-views/live/index.tsx`
- FR-5 Group close action
  - `src/sidepanel/main-views/live/index.tsx`

## Execution slices

The active internal execution plan now lives in the paired private context repo:

- `~/wp/crx-tab-groups-ctx/tasks/active.md`
- `~/wp/crx-tab-groups-ctx/tasks/stories/2026-04-18-define-saved-group-product-promise.md`

Keep this source-repo document limited to public-safe implementation routing. Do not expand it into the canonical home for internal planning, active stories, or private workflow notes.

## Repo routing

### Source repo

Keep here:

- project-level architecture and requirement snapshots that are safe to publish
- implementation-facing design notes
- module-level design docs close to the code they describe

### Private `-ctx` repo

Use there:

- internal planning
- speculative design options
- review notes
- backlog grooming
- release coordination
- active execution slices
- provisional product-definition notes

## Deferred items

- full BRD
- full SRS
- detailed LLD per every component
- formal database design beyond current storage-model docs

Those can be added later if the project grows beyond the current extension scope.
