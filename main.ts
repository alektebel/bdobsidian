import { App, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import { ModelLoader, EmbeddingModel } from './embedding-model';
import { VectorDatabase } from './vector-database';
import { NoteIndexer, IndexerSettings } from './note-indexer';
import { SearchModal } from './search-modal';
import { OllamaClient } from './ollama-client';
import { ChatModal } from './chat-modal';
import { WebSearchSettings, DEFAULT_WEB_SEARCH_SETTINGS } from './web-search-tool';
import { RawNoteOrganizer, OrganizerSettings, DEFAULT_ORGANIZER_SETTINGS, OrganizeSuggestion } from './raw-note-organizer';
import { OrganizeApprovalModal } from './organize-approval-modal';
import { ModelPickerModal } from './model-picker-modal';
import { ContextMenuHarness, organizeAction, summarizeAction } from './context-menu';
import { GitSync } from './git-sync';

interface VectorDBPluginSettings {
    modelPath: string;
    modelName: string;
    chunkSize: number;
    chunkOverlap: number;
    excludePatterns: string;
    searchTopK: number;
    searchThreshold: number;
    autoIndexOnSave: boolean;
    embeddingDimension: number;
    ollamaUrl: string;
    ollamaModel: string;
    webSearch: WebSearchSettings;
    organizer: OrganizerSettings;
    gitAutoPull: boolean;
    gitCommitMessage: string;
}

const DEFAULT_SETTINGS: VectorDBPluginSettings = {
    modelPath: 'Xenova/all-MiniLM-L6-v2',
    modelName: 'all-MiniLM-L6-v2',
    chunkSize: 500,
    chunkOverlap: 50,
    excludePatterns: '^\\..*|node_modules',
    searchTopK: 10,
    searchThreshold: 0.3,
    autoIndexOnSave: true,
    embeddingDimension: 384,
    ollamaUrl: 'http://localhost:11436',
    ollamaModel: 'ornith-35b',
    webSearch: { ...DEFAULT_WEB_SEARCH_SETTINGS },
    organizer: { ...DEFAULT_ORGANIZER_SETTINGS },
    gitAutoPull: true,
    gitCommitMessage: 'Auto-sync notes',
};

export default class VectorDBPlugin extends Plugin {
    settings: VectorDBPluginSettings;
    private modelLoader: ModelLoader;
    private model: EmbeddingModel | null = null;
    private database: VectorDatabase | null = null;
    private indexer: NoteIndexer | null = null;
    private isInitialized: boolean = false;
    private dbFilePath: string;
    private ollamaClient: OllamaClient;
    private organizer: RawNoteOrganizer | null = null;
    private organizerTimerId: number | null = null;
    private contextMenuHarness: ContextMenuHarness;
    private gitSync: GitSync;
    private gitStatusBarEl: HTMLElement;
    private gitStatusInterval: number | null = null;

    async onload() {
        await this.loadSettings();

        // Initialize components
        this.modelLoader = new ModelLoader();
        this.dbFilePath = `${this.manifest.dir}/vector-db.json`;

        // Ollama client
        this.ollamaClient = new OllamaClient(this.settings.ollamaUrl, this.settings.ollamaModel);

        // Context menu harness for right-click model actions
        this.contextMenuHarness = new ContextMenuHarness(this.app, this.settings.ollamaUrl);
        this.contextMenuHarness.registerAction(organizeAction);
        this.contextMenuHarness.registerAction(summarizeAction);
        this.contextMenuHarness.registerFileMenu();

        // Git sync
        this.gitSync = new GitSync((this.app.vault.adapter as any).getBasePath?.() ?? this.app.vault.adapter.basePath ?? '.');
        this.gitStatusBarEl = this.addStatusBarItem();
        this.gitStatusBarEl.setText('Git: ...');
        this.gitStatusBarEl.style.cssText = 'cursor: pointer;';
        this.gitStatusBarEl.onclick = () => this.gitPush();

        const gitRibbon = this.addRibbonIcon('git-branch', 'Git sync', () => {
            this.gitPush();
        });
        gitRibbon.addClass('bd-git-sync');

        this.addCommand({
            id: 'git-push',
            name: 'Push notes to git',
            callback: () => this.gitPush(),
        });

        this.addCommand({
            id: 'git-pull',
            name: 'Pull notes from git',
            callback: () => this.gitPull(),
        });

        this.registerInterval(
            window.setInterval(() => this.updateGitStatus(), 60000)
        );

        // Add ribbon icons
        this.addRibbonIcon('database', 'Vector Database', () => {
            this.openSearchModal();
        });

        this.addRibbonIcon('message-square', 'Chat with Vault (Ornith)', () => {
            this.openChatModal();
        });

        // Add commands
        this.addCommand({
            id: 'index-all-notes',
            name: 'Index all notes',
            callback: async () => {
                await this.indexAllNotes();
            }
        });

        this.addCommand({
            id: 'index-current-note',
            name: 'Index current note',
            callback: async () => {
                await this.indexCurrentNote();
            }
        });

        this.addCommand({
            id: 'search-notes',
            name: 'Search notes semantically',
            callback: () => {
                this.openSearchModal();
            }
        });

        this.addCommand({
            id: 'clear-index',
            name: 'Clear vector index',
            callback: async () => {
                await this.clearIndex();
            }
        });

        this.addCommand({
            id: 'show-stats',
            name: 'Show database statistics',
            callback: () => {
                this.showStats();
            }
        });

        this.addCommand({
            id: 'chat-vault',
            name: 'Chat with vault (Ornith RAG)',
            callback: () => {
                this.openChatModal();
            }
        });

        this.addCommand({
            id: 'organize-raw-notes',
            name: 'Organize raw notes',
            callback: () => {
                this.organizeRawNotes();
            }
        });

        // Add settings tab
        this.addSettingTab(new VectorDBSettingTab(this.app, this));

        // Initialize on startup (delayed to not block Obsidian startup)
        this.app.workspace.onLayoutReady(async () => {
            await this.initialize();
            this.setupOrganizer();
            this.updateGitStatus();
            if (this.settings.gitAutoPull) {
                this.gitPull();
            }
        });

        // Auto-index on file save
        this.registerEvent(
            this.app.vault.on('modify', async (file) => {
                if (this.settings.autoIndexOnSave && file instanceof TFile && file.extension === 'md') {
                    if (this.isInitialized && this.indexer) {
                        try {
                            await this.indexer.updateNote(file);
                        } catch (error) {
                            console.error('Error auto-indexing file:', error);
                        }
                    }
                }
            })
        );

        // Remove from index on file delete
        this.registerEvent(
            this.app.vault.on('delete', (file) => {
                if (file instanceof TFile && file.extension === 'md') {
                    if (this.indexer) {
                        this.indexer.removeNote(file.path);
                    }
                }
            })
        );

        // Handle file rename
        this.registerEvent(
            this.app.vault.on('rename', async (file, oldPath) => {
                if (file instanceof TFile && file.extension === 'md') {
                    if (this.indexer) {
                        this.indexer.removeNote(oldPath);
                        await this.indexer.updateNote(file);
                    }
                }
            })
        );

        console.log('Vector Database Plugin loaded');
    }

    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            new Notice('Initializing Vector Database...');
            
            // Load embedding model
            console.log(`Loading model: ${this.settings.modelPath}`);
            this.model = await this.modelLoader.loadModel(
                this.settings.modelPath,
                this.settings.modelName
            );

            // Initialize database
            this.database = new VectorDatabase(this.settings.embeddingDimension);
            
            // Try to load existing database
            await this.loadDatabase();

            // Initialize indexer
            const indexerSettings: IndexerSettings = {
                chunkSize: this.settings.chunkSize,
                chunkOverlap: this.settings.chunkOverlap,
                excludePatterns: this.settings.excludePatterns.split('|').filter(p => p.trim())
            };

            this.indexer = new NoteIndexer(
                this.app.vault,
                this.model,
                this.database,
                indexerSettings
            );

            this.isInitialized = true;
            new Notice('Vector Database initialized successfully');
            console.log('Vector Database initialized');
        } catch (error) {
            new Notice(`Failed to initialize Vector Database: ${error.message}`);
            console.error('Initialization error:', error);
        }
    }

    async indexAllNotes() {
        if (!this.isInitialized) {
            new Notice('Vector Database not initialized. Please wait...');
            await this.initialize();
        }

        if (!this.indexer) {
            new Notice('Indexer not available');
            return;
        }

        const notice = new Notice('Indexing all notes...', 0);
        
        try {
            await this.indexer.indexAllNotes((current, total, fileName) => {
                notice.setMessage(`Indexing: ${current}/${total} - ${fileName}`);
            });

            await this.saveDatabase();
            
            notice.hide();
            new Notice('All notes indexed successfully');
            this.showStats();
        } catch (error) {
            notice.hide();
            new Notice(`Indexing failed: ${error.message}`);
            console.error('Indexing error:', error);
        }
    }

    async indexCurrentNote() {
        if (!this.isInitialized) {
            await this.initialize();
        }

        if (!this.indexer) {
            new Notice('Indexer not available');
            return;
        }

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('No active file');
            return;
        }

        try {
            await this.indexer.indexNote(activeFile, true);
            await this.saveDatabase();
            new Notice(`Indexed: ${activeFile.basename}`);
        } catch (error) {
            new Notice(`Failed to index: ${error.message}`);
            console.error('Index error:', error);
        }
    }

    openSearchModal() {
        if (!this.isInitialized) {
            new Notice('Please initialize the database first by indexing your notes');
            return;
        }

        const modal = new SearchModal(
            this.app,
            async (query: string) => {
                return await this.search(query);
            },
            (result) => {
                const file = this.app.vault.getAbstractFileByPath(result.entry.metadata.path);
                if (file instanceof TFile) {
                    this.app.workspace.getLeaf().openFile(file);
                }
            }
        );
        modal.open();
    }

    openChatModal() {
        if (!this.isInitialized || !this.database || !this.model) {
            new Notice('Please initialize the database first by indexing your notes');
            return;
        }

        this.ollamaClient.setBaseUrl(this.settings.ollamaUrl);
        this.ollamaClient.setModel(this.settings.ollamaModel);

        const modal = new ChatModal(
            this.app,
            this.database,
            this.ollamaClient,
            async (text: string) => {
                if (!this.model) throw new Error('Model not loaded');
                return await this.model.embed(text);
            },
            this.settings.webSearch,
        );
        modal.open();
    }

    private setupOrganizer() {
        if (this.organizerTimerId !== null) {
            window.clearInterval(this.organizerTimerId);
        }

        this.organizer = new RawNoteOrganizer(
            this.app,
            this.ollamaClient,
            this.settings.organizer,
        );

        if (this.settings.organizer.enabled) {
            const ms = this.settings.organizer.intervalMinutes * 60 * 1000;
            this.organizerTimerId = window.setInterval(() => {
                this.organizeRawNotes();
            }, ms);
        }
    }

    async organizeRawNotes() {
        if (!this.organizer) {
            new Notice('Organizer not initialized');
            return;
        }

        this.organizer.updateSettings(this.settings.organizer);

        const rawNotes = await this.organizer.findRawNotes();
        if (rawNotes.length === 0) {
            return;
        }

        const notice = new Notice(`Analyzing ${rawNotes.length} raw note(s)...`, 0);

        const suggestions: OrganizeSuggestion[] = [];
        for (const file of rawNotes) {
            notice.setMessage(`Analyzing: ${file.basename}...`);
            const suggestion = await this.organizer.analyzeNote(file);
            if (suggestion) {
                suggestions.push(suggestion);
            }
        }

        notice.hide();

        if (suggestions.length === 0) {
            new Notice('Could not analyze any raw notes');
            return;
        }

        if (this.settings.organizer.requireApproval) {
            const modal = new OrganizeApprovalModal(
                this.app,
                suggestions,
                async (s) => this.organizer!.applySuggestion(s),
            );
            modal.open();
        } else {
            let applied = 0;
            for (const s of suggestions) {
                const ok = await this.organizer.applySuggestion(s);
                if (ok) applied++;
            }
            new Notice(`Organized ${applied}/${suggestions.length} notes`);
        }
    }

    async gitPush() {
        const status = await this.gitSync.getStatus();
        if (!status) {
            this.gitStatusBarEl.setText('Git: not available');
            return;
        }
        const dirty = status.dirty + status.staged;
        if (dirty === 0 && status.ahead === 0) {
            new Notice('Nothing to push');
            return;
        }
        await this.gitSync.commitAndPush(this.settings.gitCommitMessage);
        this.updateGitStatus();
    }

    async gitPull() {
        this.gitStatusBarEl.setText('Git: pulling...');
        const ok = await this.gitSync.pull();
        this.updateGitStatus();
    }

    async updateGitStatus() {
        const status = await this.gitSync.getStatus();
        if (!status) {
            this.gitStatusBarEl.setText('Git: not available');
            return;
        }
        const parts: string[] = [];
        const dirty = status.dirty + status.staged;
        if (dirty > 0) parts.push(`⚠${dirty}`);
        if (status.ahead > 0) parts.push(`↑${status.ahead}`);
        if (status.behind > 0) parts.push(`↓${status.behind}`);
        this.gitStatusBarEl.setText(parts.length > 0 ? parts.join(' ') : 'Git: ok');
    }

    async search(query: string) {
        if (!this.model || !this.database) {
            throw new Error('Database not initialized');
        }

        // Generate embedding for query
        const queryEmbedding = await this.model.embed(query);
        
        // Search database
        const results = this.database.search(
            queryEmbedding[0],
            this.settings.searchTopK,
            this.settings.searchThreshold
        );

        return results;
    }

    async clearIndex() {
        if (this.database) {
            this.database.clear();
            await this.saveDatabase();
            new Notice('Vector index cleared');
        }
    }

    showStats() {
        if (!this.indexer) {
            new Notice('Indexer not initialized');
            return;
        }

        const stats = this.indexer.getStats();
        new Notice(
            `Database Stats:\n` +
            `Documents: ${stats.totalDocuments}\n` +
            `Vectors: ${stats.totalVectors}\n` +
            `Dimension: ${stats.dimension}\n` +
            `Avg vectors/doc: ${stats.avgVectorsPerDocument.toFixed(1)}`,
            10000
        );
    }

    async loadDatabase() {
        try {
            const data = await this.app.vault.adapter.read(this.dbFilePath);
            const parsed = JSON.parse(data);
            this.database = VectorDatabase.fromJSON(parsed);
            console.log('Loaded existing vector database');
        } catch (error) {
            console.log('No existing database found, starting fresh');
        }
    }

    async saveDatabase() {
        if (!this.database) {
            return;
        }

        try {
            const data = JSON.stringify(this.database.toJSON(), null, 2);
            await this.app.vault.adapter.write(this.dbFilePath, data);
            console.log('Database saved');
        } catch (error) {
            console.error('Failed to save database:', error);
        }
    }

    onunload() {
        // Save database before unloading
        if (this.database) {
            this.saveDatabase();
        }
        console.log('Vector Database Plugin unloaded');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class VectorDBSettingTab extends PluginSettingTab {
    plugin: VectorDBPlugin;

    constructor(app: App, plugin: VectorDBPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl('h2', { text: 'Vector Database Settings' });

        // Model settings
        containerEl.createEl('h3', { text: 'Embedding Model' });

        new Setting(containerEl)
            .setName('Model path')
            .setDesc('HuggingFace model path or local directory (e.g., Xenova/all-MiniLM-L6-v2)')
            .addText(text => text
                .setPlaceholder('Xenova/all-MiniLM-L6-v2')
                .setValue(this.plugin.settings.modelPath)
                .onChange(async (value) => {
                    this.plugin.settings.modelPath = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Model name')
            .setDesc('Display name for the model')
            .addText(text => text
                .setPlaceholder('all-MiniLM-L6-v2')
                .setValue(this.plugin.settings.modelName)
                .onChange(async (value) => {
                    this.plugin.settings.modelName = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Embedding dimension')
            .setDesc('Vector dimension of the model (default: 384 for MiniLM)')
            .addText(text => text
                .setPlaceholder('384')
                .setValue(String(this.plugin.settings.embeddingDimension))
                .onChange(async (value) => {
                    const dim = parseInt(value);
                    if (!isNaN(dim) && dim > 0) {
                        this.plugin.settings.embeddingDimension = dim;
                        await this.plugin.saveSettings();
                    }
                }));

        // Indexing settings
        containerEl.createEl('h3', { text: 'Indexing' });

        new Setting(containerEl)
            .setName('Chunk size')
            .setDesc('Number of characters per chunk')
            .addText(text => text
                .setPlaceholder('500')
                .setValue(String(this.plugin.settings.chunkSize))
                .onChange(async (value) => {
                    const size = parseInt(value);
                    if (!isNaN(size) && size > 0) {
                        this.plugin.settings.chunkSize = size;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Chunk overlap')
            .setDesc('Number of overlapping characters between chunks')
            .addText(text => text
                .setPlaceholder('50')
                .setValue(String(this.plugin.settings.chunkOverlap))
                .onChange(async (value) => {
                    const overlap = parseInt(value);
                    if (!isNaN(overlap) && overlap >= 0) {
                        this.plugin.settings.chunkOverlap = overlap;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Exclude patterns')
            .setDesc('Regex patterns to exclude files (separated by |)')
            .addText(text => text
                .setPlaceholder('^\\..*|node_modules')
                .setValue(this.plugin.settings.excludePatterns)
                .onChange(async (value) => {
                    this.plugin.settings.excludePatterns = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Auto-index on save')
            .setDesc('Automatically update index when files are modified')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoIndexOnSave)
                .onChange(async (value) => {
                    this.plugin.settings.autoIndexOnSave = value;
                    await this.plugin.saveSettings();
                }));

        // Search settings
        containerEl.createEl('h3', { text: 'Search' });

        new Setting(containerEl)
            .setName('Top K results')
            .setDesc('Maximum number of search results to return')
            .addText(text => text
                .setPlaceholder('10')
                .setValue(String(this.plugin.settings.searchTopK))
                .onChange(async (value) => {
                    const topK = parseInt(value);
                    if (!isNaN(topK) && topK > 0) {
                        this.plugin.settings.searchTopK = topK;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Similarity threshold')
            .setDesc('Minimum similarity score (0-1) to include in results')
            .addText(text => text
                .setPlaceholder('0.3')
                .setValue(String(this.plugin.settings.searchThreshold))
                .onChange(async (value) => {
                    const threshold = parseFloat(value);
                    if (!isNaN(threshold) && threshold >= 0 && threshold <= 1) {
                        this.plugin.settings.searchThreshold = threshold;
                        await this.plugin.saveSettings();
                    }
                }));

        // Web search settings
        containerEl.createEl('h3', { text: 'Web Search Tool' });

        new Setting(containerEl)
            .setName('Enable web search')
            .setDesc('Allow the Ornith model to search the web for current information')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.webSearch.enabled)
                .onChange(async (value) => {
                    this.plugin.settings.webSearch.enabled = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Search provider')
            .setDesc('DuckDuckGo (no API key needed) or Google Custom Search')
            .addDropdown(dropdown => dropdown
                .addOption('duckduckgo', 'DuckDuckGo')
                .addOption('google', 'Google Custom Search')
                .setValue(this.plugin.settings.webSearch.provider)
                .onChange(async (value: string) => {
                    this.plugin.settings.webSearch.provider = value as 'duckduckgo' | 'google';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Google API key')
            .setDesc('Required for Google Custom Search (https://developers.google.com/custom-search)')
            .addText(text => text
                .setPlaceholder('AIza...')
                .setValue(this.plugin.settings.webSearch.googleApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.webSearch.googleApiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Google Search Engine ID')
            .setDesc('cx parameter from Google Custom Search')
            .addText(text => text
                .setPlaceholder('0123456789...')
                .setValue(this.plugin.settings.webSearch.googleCx)
                .onChange(async (value) => {
                    this.plugin.settings.webSearch.googleCx = value;
                    await this.plugin.saveSettings();
                }));

        // Raw Note Organizer settings
        containerEl.createEl('h3', { text: 'Raw Note Organizer' });

        new Setting(containerEl)
            .setName('Enable auto-organizer')
            .setDesc('Periodically organize new notes from the raw folder')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.organizer.enabled)
                .onChange(async (value) => {
                    this.plugin.settings.organizer.enabled = value;
                    await this.plugin.saveSettings();
                    this.plugin.setupOrganizer();
                }));

        new Setting(containerEl)
            .setName('Raw folder')
            .setDesc('Folder to watch for new notes to organize')
            .addText(text => text
                .setPlaceholder('raw')
                .setValue(this.plugin.settings.organizer.rawFolder)
                .onChange(async (value) => {
                    this.plugin.settings.organizer.rawFolder = value || 'raw';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Interval (minutes)')
            .setDesc('How often to check for new raw notes (default: 120 = 2 hours)')
            .addText(text => text
                .setPlaceholder('120')
                .setValue(String(this.plugin.settings.organizer.intervalMinutes))
                .onChange(async (value) => {
                    const mins = parseInt(value);
                    if (!isNaN(mins) && mins >= 5) {
                        this.plugin.settings.organizer.intervalMinutes = mins;
                        await this.plugin.saveSettings();
                        this.plugin.setupOrganizer();
                    }
                }));

        new Setting(containerEl)
            .setName('Require approval')
            .setDesc('Show approval dialog before applying changes')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.organizer.requireApproval)
                .onChange(async (value) => {
                    this.plugin.settings.organizer.requireApproval = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Organize now')
            .setDesc('Run organization on raw folder immediately')
            .addButton(btn => btn
                .setButtonText('Organize')
                .setCta()
                .onClick(() => {
                    this.plugin.organizeRawNotes();
                }));

        // Ornith / LLM settings
        containerEl.createEl('h3', { text: 'Ornith (Local LLM)' });

        new Setting(containerEl)
            .setName('Ollama URL')
            .setDesc('URL of your Ollama instance (default: http://localhost:11434)')
            .addText(text => text
                .setPlaceholder('http://localhost:11434')
                .setValue(this.plugin.settings.ollamaUrl)
                .onChange(async (value) => {
                    this.plugin.settings.ollamaUrl = value;
                    this.plugin.contextMenuHarness.setOllamaUrl(value);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Ornith model name')
            .setDesc('Model name for the Ornith server (e.g., ornith-35b)')
            .addText(text => text
                .setPlaceholder('hf.co/bartowski/...')
                .setValue(this.plugin.settings.ollamaModel)
                .onChange(async (value) => {
                    this.plugin.settings.ollamaModel = value;
                    await this.plugin.saveSettings();
                }))
            .addButton(btn => btn
                .setButtonText('Browse')
                .onClick(() => {
                    const client = new OllamaClient(this.plugin.settings.ollamaUrl);
                    const modal = new ModelPickerModal(
                        this.app,
                        client,
                        this.plugin.settings.ollamaUrl,
                        async (model) => {
                            this.plugin.settings.ollamaModel = model;
                            await this.plugin.saveSettings();
                            this.display();
                        },
                    );
                    modal.open();
                }));

        new Setting(containerEl)
            .setName('Test connection')
            .setDesc('Check if Ollama is running and the model is available')
            .addButton(btn => btn
                .setButtonText('Test')
                .onClick(async () => {
                    const client = new OllamaClient(
                        this.plugin.settings.ollamaUrl,
                        this.plugin.settings.ollamaModel
                    );
                    const ok = await client.checkConnection();
                    new Notice(ok ? 'Connected to Ornith!' : 'Could not connect. Check Ollama is running.');
                }));

        // Git sync settings
        containerEl.createEl('h3', { text: 'Git Sync' });

        new Setting(containerEl)
            .setName('Auto-pull on startup')
            .setDesc('Automatically pull latest from git when Obsidian opens')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.gitAutoPull)
                .onChange(async (value) => {
                    this.plugin.settings.gitAutoPull = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Commit message')
            .setDesc('Message used when auto-committing changes')
            .addText(text => text
                .setPlaceholder('Auto-sync notes')
                .setValue(this.plugin.settings.gitCommitMessage)
                .onChange(async (value) => {
                    this.plugin.settings.gitCommitMessage = value || 'Auto-sync notes';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Push now')
            .setDesc('Commit and push pending changes to remote')
            .addButton(btn => btn
                .setButtonText('Push')
                .setCta()
                .onClick(() => this.plugin.gitPush()));

        // Actions
        containerEl.createEl('h3', { text: 'Actions' });

        new Setting(containerEl)
            .setName('Reinitialize')
            .setDesc('Reload the model and reinitialize the database')
            .addButton(btn => btn
                .setButtonText('Reinitialize')
                .onClick(async () => {
                    this.plugin.isInitialized = false;
                    await this.plugin.initialize();
                }));
    }
}
