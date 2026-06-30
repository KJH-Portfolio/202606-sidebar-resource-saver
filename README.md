---
작성일: 2026-06-30T18:58
수정일: 2026-06-30T20:18
---
# Obsidian Sidebar Resource Saver

A lightweight plugin for Obsidian that drastically reduces RAM and CPU usage by automatically suspending webviews and iframes (e.g., from the Surfing plugin) when the sidebars are collapsed.

## Why this plugin?
Browsers and webviews inside Obsidian sidebars continue to consume significant system resources (Memory & CPU) even when the sidebars are folded and hidden from view. This plugin detects when a sidebar is collapsed and forces the webviews inside it to unload, returning 100% of the memory. When you expand the sidebar again, the webview is seamlessly restored to its previous state.

## Features
- **Zero-Event Polling Mechanism**: Bypasses Obsidian's layout-change event bugs by using an ultra-lightweight polling system. It guarantees 100% detection of sidebar collapses without any performance hit.
- **Global Webview Sweep**: Traverses the entire DOM tree to find hidden webviews, bypassing any complex sidebar DOM nesting.
- **Event Shielding**: Prevents external plugins (like Surfing) from accidentally overwriting your saved pages when the webview is temporarily unloaded to `about:blank`.
- **Automatic Restore**: Restores the exact URL you were browsing as soon as you expand the sidebar.

## Installation
*(Coming soon to the Community Plugins list)*

### Manual Installation
1. Download the latest release from the Releases page.
2. Extract `main.js` and `manifest.json`.
3. Place them in your `.obsidian/plugins/obsidian-sidebar-resource-saver/` folder.
4. Reload Obsidian and enable the plugin.

## Developer
Developed by KJH.
