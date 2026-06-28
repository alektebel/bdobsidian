# Quick Start

## Installation

1. Copy these files to your Obsidian vault at `.obsidian/plugins/local-vector-db/`:
   - `main.js` (the compiled plugin)
   - `manifest.json`
   - `styles.css`

2. Enable the plugin:
   - Open Obsidian Settings
   - Go to Community Plugins
   - Enable "Local Vector Database"

## First Use

1. **Index your notes**:
   - Press `Ctrl/Cmd + P` (command palette)
   - Type "Index all notes"
   - Wait for indexing to complete

2. **Search semantically**:
   - Press `Ctrl/Cmd + P`
   - Type "Search notes semantically"
   - Enter your query (e.g., "notes about productivity")
   - Click a result to open that note

## That's it!

The plugin uses the MiniLM-L6-v2 model by default, which will download automatically on first use (around 80MB).

For advanced configuration, see [USAGE.md](USAGE.md) or [README.md](README.md).
