# Local Vector Database for Obsidian

An Obsidian plugin that creates a custom vector database from your notes using local embedding models. Perform semantic search across your knowledge base without sending data to external services.

## Features

- **Local Embedding Models**: Use models like all-MiniLM-L6-v2 or any compatible transformer model
- **Custom Model Support**: Load your own models from local directories
- **Vector Database**: Efficient similarity search across all your notes
- **Automatic Indexing**: Auto-update index when notes are modified
- **Semantic Search**: Find relevant notes based on meaning, not just keywords
- **Chunk-based Processing**: Handles large notes by splitting into manageable chunks
- **Privacy-First**: All processing happens locally on your machine

## Installation

### From Source

1. Clone this repository into your Obsidian plugins folder:
   ```bash
   cd /path/to/your/vault/.obsidian/plugins
   git clone https://github.com/yourusername/obsidian-local-vector-db local-vector-db
   cd local-vector-db
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the plugin:
   ```bash
   npm run build
   ```

4. Enable the plugin in Obsidian Settings → Community Plugins

## Usage

### Initial Setup

1. Open Settings → Local Vector Database
2. Configure your embedding model (default: `Xenova/all-MiniLM-L6-v2`)
3. Adjust chunk size and other indexing parameters
4. Run the command "Index all notes" from the command palette (Ctrl/Cmd + P)

### Commands

- **Index all notes**: Index your entire vault
- **Index current note**: Index only the currently open note
- **Search notes semantically**: Open the semantic search modal
- **Clear vector index**: Remove all indexed vectors
- **Show database statistics**: Display index statistics

### Search

1. Press Ctrl/Cmd + P and run "Search notes semantically"
2. Enter your search query (can be a question or description)
3. View results ranked by semantic similarity
4. Click a result to open that note

## Configuration

### Embedding Model Settings

- **Model path**: HuggingFace model identifier (e.g., `Xenova/all-MiniLM-L6-v2`) or local path
- **Model name**: Display name for the model
- **Embedding dimension**: Vector dimension (384 for MiniLM models)

### Indexing Settings

- **Chunk size**: Number of characters per chunk (default: 500)
- **Chunk overlap**: Overlapping characters between chunks (default: 50)
- **Exclude patterns**: Regex patterns to exclude files (e.g., `^\\..*|node_modules`)
- **Auto-index on save**: Automatically update index when files change

### Search Settings

- **Top K results**: Maximum number of results to return (default: 10)
- **Similarity threshold**: Minimum similarity score 0-1 (default: 0.3)

## Supported Models

The plugin uses [Transformers.js](https://huggingface.co/docs/transformers.js) and supports various embedding models:

### Pre-configured Models

- `Xenova/all-MiniLM-L6-v2` (384 dim) - Fast, efficient, recommended
- `Xenova/all-MiniLM-L12-v2` (384 dim) - More accurate, slower
- `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (384 dim) - Multilingual support

### Custom Models

You can use any sentence-transformers compatible model:

1. Download the model to a local directory
2. Set the model path to the directory in settings
3. Configure the correct embedding dimension
4. Reinitialize the plugin

## How It Works

1. **Text Chunking**: Notes are split into overlapping chunks for better context
2. **Embedding Generation**: Each chunk is converted to a dense vector using the embedding model
3. **Vector Storage**: Vectors are stored in a local JSON database
4. **Similarity Search**: Queries are embedded and compared using cosine similarity
5. **Result Ranking**: Results are ranked by semantic similarity score

## Performance Tips

- **Chunk Size**: Smaller chunks (300-500) work better for specific queries, larger chunks (800-1200) for broader context
- **Model Selection**: MiniLM-L6 is fast and works well for most use cases
- **Exclude Patterns**: Exclude large or irrelevant files to reduce indexing time
- **Auto-index**: Disable if you have a large vault and prefer manual indexing

## Development

### Building

```bash
npm run build
```

### Development mode (auto-rebuild)

```bash
npm run dev
```

### Project Structure

- `main.ts` - Main plugin class and settings
- `embedding-model.ts` - Model loader and embedding generation
- `vector-database.ts` - Vector storage and similarity search
- `note-indexer.ts` - Note processing and indexing
- `search-modal.ts` - Search UI interface
- `styles.css` - UI styling

## Troubleshooting

### Model Loading Issues

- Ensure you have an internet connection for first-time model download
- Models are cached locally after first use
- Check console (Ctrl/Cmd + Shift + I) for error messages

### Indexing Problems

- Large vaults may take time to index initially
- Check exclude patterns if certain files aren't indexing
- Try indexing individual notes first to test

### Search Not Working

- Ensure notes are indexed first
- Check similarity threshold (lower values = more results)
- Verify the model initialized successfully

## Privacy & Data

- All processing happens locally on your machine
- No data is sent to external servers (except initial model download)
- The vector database is stored in your vault's plugin folder
- Models are cached locally by Transformers.js

## License

MIT

## Credits

- Built with [Obsidian API](https://github.com/obsidianmd/obsidian-api)
- Uses [Transformers.js](https://huggingface.co/docs/transformers.js) by Hugging Face
- Embedding models from [sentence-transformers](https://www.sbert.net/)

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.
