# Crx Tab Groups

A Chrome extension for inspecting live browser tab groups and managing saved-group snapshots with React, TypeScript, Vite, and Manifest V3.

## Product Shape

The side panel currently separates work into three lanes:

- `Live`
- `Rules`
- `Saved`

### Live

`Live` is the inspection and quick-action lane for the current browser state. It shows pinned tabs, grouped tabs, and ungrouped tabs from the browser right now.

### Rules

`Rules` is the automation lane for managing URL-based auto-grouping rules. Active rules are used by the extension background worker to group matching tabs automatically.

### Saved

`Saved` is the persisted snapshot lane. It represents saved groups stored through Chrome sync storage for later review and restore-oriented workflows.

## Current Product Promise

- a saved group is a persisted snapshot that can be reviewed now and restored later
- a saved group is not a two-way synchronization model
- live browser changes should not silently rewrite saved snapshots

## Features

- live inspection of pinned, grouped, and ungrouped tabs
- URL-based auto-grouping rules managed from the side panel
- saved-group snapshots through Chrome sync storage
- side-panel UI built with React and Tailwind CSS
- schema migration support for persisted storage evolution

## Tech Stack

- React 18
- TypeScript
- Vite
- Manifest V3
- Tailwind CSS 4
- Radix UI
- Lucide Icons

## Repository Structure

- `src/sidepanel/`
  - main side-panel UI
- `src/background/`
  - background and extension runtime behavior
- `src/storage/`
  - sync-storage adapters and repositories
- `src/migrations/`
  - schema migration system
- `src/components/`
  - reusable React components
- `src/hooks/`
  - shared hooks
- `src/manifest.ts`
  - extension manifest definition

## Prerequisites

- Node.js `>= 14.18.0`
- `pnpm`
- Chrome with Developer Mode enabled

## Install

```shell
pnpm install
```

## Develop

```shell
pnpm dev
```

## Build

```shell
pnpm build
```

## Load In Chrome

1. Open `chrome://extensions/`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the generated extension build folder

## Debugging

- inspect the extension side panel from Chrome's extension tooling
- open the side-panel view directly during development using the local URL printed by Vite after `pnpm dev`
- some Chrome APIs may not be fully available outside the extension runtime
