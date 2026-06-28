import { App, Modal, Setting, TFile } from 'obsidian';
import { SearchResult } from './vector-database';

export class SearchModal extends Modal {
    private query: string = '';
    private results: SearchResult[] = [];
    private onSearch: (query: string) => Promise<SearchResult[]>;
    private onSelect: (result: SearchResult) => void;

    constructor(
        app: App,
        onSearch: (query: string) => Promise<SearchResult[]>,
        onSelect: (result: SearchResult) => void
    ) {
        super(app);
        this.onSearch = onSearch;
        this.onSelect = onSelect;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Semantic Search' });

        // Search input
        new Setting(contentEl)
            .setName('Search query')
            .setDesc('Enter text to search semantically across your notes')
            .addText(text => {
                text
                    .setPlaceholder('Enter your search query...')
                    .setValue(this.query)
                    .onChange(async (value) => {
                        this.query = value;
                    });
                text.inputEl.addEventListener('keydown', async (e) => {
                    if (e.key === 'Enter') {
                        await this.performSearch();
                    }
                });
                // Auto-focus the input
                setTimeout(() => text.inputEl.focus(), 100);
            })
            .addButton(btn => {
                btn
                    .setButtonText('Search')
                    .setCta()
                    .onClick(async () => {
                        await this.performSearch();
                    });
            });

        // Results container
        const resultsContainer = contentEl.createDiv('search-results-container');
        this.resultsContainer = resultsContainer;

        // Initial message
        resultsContainer.createEl('p', {
            text: 'Enter a query to search your notes semantically',
            cls: 'search-placeholder'
        });
    }

    private resultsContainer: HTMLDivElement;

    private async performSearch() {
        if (!this.query.trim()) {
            return;
        }

        this.resultsContainer.empty();
        this.resultsContainer.createEl('p', { text: 'Searching...', cls: 'search-loading' });

        try {
            this.results = await this.onSearch(this.query);
            this.displayResults();
        } catch (error) {
            this.resultsContainer.empty();
            this.resultsContainer.createEl('p', {
                text: `Error: ${error.message}`,
                cls: 'search-error'
            });
        }
    }

    private displayResults() {
        this.resultsContainer.empty();

        if (this.results.length === 0) {
            this.resultsContainer.createEl('p', {
                text: 'No results found',
                cls: 'search-no-results'
            });
            return;
        }

        this.resultsContainer.createEl('p', {
            text: `Found ${this.results.length} results`,
            cls: 'search-count'
        });

        const resultsList = this.resultsContainer.createDiv('search-results-list');

        for (const result of this.results) {
            const resultEl = resultsList.createDiv('search-result-item');
            
            resultEl.addEventListener('click', () => {
                this.onSelect(result);
                this.close();
            });

            // Title and similarity score
            const headerEl = resultEl.createDiv('search-result-header');
            headerEl.createEl('span', {
                text: result.entry.metadata.title,
                cls: 'search-result-title'
            });
            headerEl.createEl('span', {
                text: `${(result.similarity * 100).toFixed(1)}%`,
                cls: 'search-result-score'
            });

            // Path
            resultEl.createEl('div', {
                text: result.entry.metadata.path,
                cls: 'search-result-path'
            });

            // Content preview
            const content = result.entry.metadata.content;
            const preview = content.length > 200 
                ? content.substring(0, 200) + '...'
                : content;
            resultEl.createEl('div', {
                text: preview,
                cls: 'search-result-preview'
            });
        }
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
