# Agentic Workstation

A lightweight IDE for macOS built on Electron and React: project tabs, a file tree,
an editor and GUIs for LLM providers, with Claude Code first.

This is the scaffold stage. The window layout, the file tree and self-update work.
The editor, the Claude Code GUI and the design system are placeholders.

## Getting started

Requires Node 24 and pnpm 11.

```
pnpm install
pnpm dev
```

## Layout

```
apps/desktop      Electron app: main process, preload bridge, React window
packages/ui       design system: tokens, base styles, primitives
docs/             architecture, decisions (adr/), signing and releasing
.claude/          rules, skills, hooks and a reviewer for Claude Code
```

The window has seven zones: project tabs on top, two icon bars that switch the side
panels, a status bar, the left panel (file tree by default), the editor and the LLM
provider panel. See [docs/architecture.md](docs/architecture.md).

## Checks

```
pnpm check                                       # types, lint, styles, tests, format
pnpm --filter @agentic-workstation/desktop update:e2e    # end-to-end self-update test
```

## Releases

Builds are signed with a self-signed certificate (there is no Apple Developer ID yet)
and published to a public releases repository. Installed copies check it every few
hours and offer to update in place. See [docs/releasing.md](docs/releasing.md).

First install: download the dmg, drag the app to Applications, then run once:

```
xattr -cr "/Applications/Agentic Workstation.app"
```
