import { App, Modal, Notice } from 'obsidian';
import { OllamaClient } from './ollama-client';
import { ImportModelModal } from './import-model-modal';

export class ModelPickerModal extends Modal {
    private client: OllamaClient;
    private onSelect: (model: string) => void;
    private currentUrl: string;

    constructor(
        app: App,
        client: OllamaClient,
        currentUrl: string,
        onSelect: (model: string) => void,
    ) {
        super(app);
        this.client = client;
        this.currentUrl = currentUrl;
        this.onSelect = onSelect;
        this.modalEl.style.width = '90%';
        this.modalEl.style.maxWidth = '600px';
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Available Models' });

        const importBtn = contentEl.createEl('button', { text: '+ Import GGUF' });
        importBtn.style.cssText = 'margin-bottom: 12px; padding: 6px 14px; cursor: pointer;';
        importBtn.onclick = () => {
            const modal = new ImportModelModal(this.app, this.client, () => {
                this.onOpen();
            });
            modal.open();
        };

        const statusEl = contentEl.createEl('p', { text: 'Loading models...' });

        this.client.setBaseUrl(this.currentUrl);
        const models = await this.client.listModels();

        statusEl.remove();

        if (models.length === 0) {
            contentEl.createEl('p', {
                text: 'No models found. Make sure Ollama is running at ' + this.currentUrl,
            });
            return;
        }

        const searchInput = contentEl.createEl('input', {
            type: 'text',
            placeholder: 'Search models...',
        });
        searchInput.style.cssText = 'width: 100%; padding: 8px; margin-bottom: 12px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal); box-sizing: border-box;';

        const listEl = contentEl.createDiv('model-picker-list');
        listEl.style.cssText = 'max-height: 400px; overflow-y: auto;';

        let filteredEls: HTMLElement[] = [];

        function renderModels(filter: string) {
            listEl.empty();
            filteredEls = [];
            for (const name of models) {
                if (filter && !name.toLowerCase().includes(filter.toLowerCase())) continue;
                const item = listEl.createDiv('model-picker-item');
                item.style.cssText = 'padding: 10px 12px; cursor: pointer; border-radius: 4px; margin-bottom: 2px; border: 1px solid transparent;';
                item.textContent = name;
                item.addEventListener('mouseenter', () => {
                    item.style.background = 'var(--background-modifier-hover)';
                });
                item.addEventListener('mouseleave', () => {
                    item.style.background = '';
                });
                item.addEventListener('click', () => {
                    this.onSelect(name);
                    new Notice(`Selected model: ${name}`);
                    this.close();
                });
                filteredEls.push(item);
            }
            if (filteredEls.length === 0) {
                listEl.createEl('p', { text: 'No matching models', cls: 'model-picker-empty' });
            }
        }

        searchInput.addEventListener('input', () => {
            renderModels(searchInput.value);
        });

        renderModels('');
        setTimeout(() => searchInput.focus(), 100);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
