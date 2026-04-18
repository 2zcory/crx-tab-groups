# Product Surface

`crx-tab-groups` is a Chrome extension side panel for two related but different jobs:

- inspect the current browser state
- manage saved snapshots of tab groups

This document explains the public product surface without exposing private workflow or internal planning.

## Side Panel Lanes

The side panel currently separates work into three lanes:

- `Live`
- `Notes`
- `Saved`

### Live

`Live` is the inspection and quick-action lane for the current browser state.

It is responsible for:

- showing the tabs that are open right now
- showing pinned tabs, grouped tabs, and ungrouped tabs
- letting the user take quick actions on those live tabs

It is not responsible for:

- acting as the canonical record of saved groups
- silently rewriting saved snapshots

### Notes

`Notes` is reserved for a future note-taking lane.

Right now it should be treated as an incomplete surface rather than a finished product promise.

### Saved

`Saved` is the persisted snapshot lane.

It is responsible for:

- listing saved groups stored through Chrome sync storage
- letting the user review a saved snapshot now
- supporting later restore-oriented workflows

It is not responsible for:

- mirroring live Chrome state in both directions
- staying automatically synchronized with every tab change in the browser

## Snapshot Model

The current product promise is:

- a saved group is a persisted snapshot that can be reviewed now and restored later
- a saved group is not a two-way synchronization model
- live browser changes should not silently mutate saved snapshots

This boundary matters because `Live` and `Saved` may show related material without representing the same thing.

## What The Extension Already Promises

- a side panel for browsing the current tab and tab-group state
- a separate lane for persisted saved-group snapshots
- Chrome sync storage persistence for saved-group data
- a UI distinction between live browser state and saved snapshot state

## What The Extension Does Not Promise Yet

- full restore semantics for every stale or invalid saved tab
- background two-way sync between live groups and saved groups
- a finished notes workflow
- conflict-free multi-device reconciliation beyond the current sync-storage model

## Public Documentation Boundary

This repository keeps:

- code
- setup and development docs
- code-adjacent design notes
- public-safe product surface docs

Private planning, screen review artifacts, and active decision workflow live outside the source repo.
