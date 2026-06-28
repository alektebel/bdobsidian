# Installation & Usage Guide

## Quick Start

### 1. Installation

Copy the plugin to your Obsidian vault:

```bash
# Navigate to your vault's plugins folder
cd /path/to/your/vault/.obsidian/plugins

# Create plugin directory
mkdir local-vector-db

# Copy these files to the directory:
# - main.js
# - manifest.json
# - styles.css
```

Or copy the entire built plugin folder to your vault's `.obsidian/plugins/` directory.

### 2. Enable the Plugin

1. Open Obsidian
2. Go to Settings → Community Plugins
3. Disable "Safe Mode" if enabled
4. Enable "Local Vector Database"

### 3. Initial Setup

1. Open Settings → Local Vector Database
2. The default model `Xenova/all-MiniLM-L6-v2` will work out of the box
3. Press Ctrl/Cmd+P and run "Index all notes"
4. Wait for indexing to complete (you'll see progress notifications)

### 4. Start Searching

1. Press Ctrl/Cmd+P
2. Run "Search notes semantically"
3. Enter your search query (e.g., "notes about machine learning")
4. Click a result to open that note

## Using Custom Models

### Option 1: HuggingFace Models

In Settings → Local Vector Database:

1. Set **Model path** to any compatible model:
   - `Xenova/all-MiniLM-L6-v2` (384 dim, recommended)
   - `Xenova/all-MiniLM-L12-v2` (384 dim, more accurate)
   - `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (384 dim, multilingual)

2. Set **Embedding dimension** to match the model (usually 384)

3. Click **Reinitialize** button

4. Re-index your notes

### Option 2: Local Model Directory

If you have a downloaded model:

1. Place your model files in a directory (e.g., `/home/user/models/my-embedding-model/`)
   - Should contain: `config.json`, `tokenizer.json`, model weights, etc.

2. In Settings:
   - Set **Model path** to the full directory path
   - Set **Model name** to a friendly name
   - Set **Embedding dimension** to match your model's output dimension

3. Click **Reinitialize**

4. Re-index your notes

## Settings Explained

### Embedding Model Settings

- **Model path**: HuggingFace identifier (e.g., `Xenova/all-MiniLM-L6-v2`) or local directory path
- **Model name**: Display name for the model in logs
- **Embedding dimension**: Size of the vector output (384 for MiniLM models)

### Indexing Settings

- **Chunk size** (default: 500): Characters per chunk. Smaller = more granular, larger = more context
- **Chunk overlap** (default: 50): Overlapping characters between chunks to maintain context
- **Exclude patterns**: Regex patterns to skip files (e.g., `^\\..*|templates|archive`)
- **Auto-index on save**: Automatically re-index when you edit a note

### Search Settings

- **Top K results** (default: 10): Maximum number of results to show
- **Similarity threshold** (default: 0.3): Minimum score (0-1) to include results. Lower = more results

## Commands

| Command | Description |
|---------|-------------|
| Index all notes | Index your entire vault |
| Index current note | Index only the active note |
| Search notes semantically | Open search modal |
| Clear vector index | Remove all indexed data |
| Show database statistics | View indexing stats |

## Tips & Best Practices

### For Better Search Results

1. **Use descriptive queries**: Instead of "python", try "examples of python data analysis code"
2. **Lower the threshold**: If you're getting too few results, lower the similarity threshold to 0.2
3. **Increase Top K**: Show more results by increasing the Top K setting

### For Better Performance

1. **Exclude unnecessary files**: Use exclude patterns to skip templates, archives, etc.
2. **Optimal chunk size**: 
   - 300-500 for finding specific information
   - 800-1200 for broader contextual search
3. **Disable auto-index**: For large vaults (1000+ notes), manual indexing may be better

### Model Selection

- **MiniLM-L6**: Fast, efficient, good for most use cases (recommended)
- **MiniLM-L12**: Slower but more accurate
- **Multilingual models**: If your notes are in multiple languages

## Troubleshooting

### Model Won't Load

- Check internet connection (first download requires internet)
- Models are cached locally after first use in `~/.cache/transformers.js/`
- Check console (Ctrl/Cmd+Shift+I) for detailed error messages

### Indexing is Slow

- Large vaults take time on first index
- Subsequent updates are incremental and faster
- Consider excluding large files or directories

### Search Returns No Results

1. Ensure notes are indexed (run "Index all notes")
2. Lower the similarity threshold
3. Try more descriptive queries
4. Check that the model initialized successfully

### High Memory Usage

- Large models use more memory
- Consider using MiniLM-L6 instead of L12
- Close other applications during indexing

## File Structure

```
.obsidian/plugins/local-vector-db/
├── main.js              # Compiled plugin code
├── manifest.json        # Plugin metadata
├── styles.css          # UI styling
└── vector-db.json      # Your indexed vectors (auto-generated)
```

## Privacy & Security

- All processing happens locally on your machine
- No data is sent to external servers (except initial model download from HuggingFace)
- Vector database is stored in your vault's plugin folder
- Models are cached in your system's cache directory

## Development

To modify the plugin:

```bash
npm install
npm run dev    # Watch mode for development
npm run build  # Production build
```

## Support

For issues or questions:
- Check the README.md
- Enable developer console (Ctrl/Cmd+Shift+I) for error details
- Report issues on GitHub

## Advanced: Custom Model Integration

To use a completely custom model:

1. Ensure it's compatible with Transformers.js
2. Place model files in a directory with:
   - `config.json`
   - `tokenizer.json`
   - Model weights (ONNX format preferred)
3. Set the model path to the directory
4. Configure the correct embedding dimension
5. Test with a single note first before full indexing

## Example Queries

Good semantic search queries:

- "How do I handle authentication in my application?"
- "Notes about project planning and timelines"
- "Ideas for improving code performance"
- "Personal reflections on productivity"
- "Technical documentation for API endpoints"

The search understands meaning, not just keywords, so natural language works best!
