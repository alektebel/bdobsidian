import { App, Modal, Notice, Setting } from 'obsidian';
import { OllamaClient } from './ollama-client';

export class ImportModelModal extends Modal {
    private client: OllamaClient;
    private onSuccess: () => void;
    private selectedPath: string = '';
    private modelName: string = '';
    private systemPrompt: string = '';

    constructor(app: App, client: OllamaClient, onSuccess: () => void) {
        super(app);
        this.client = client;
        this.onSuccess = onSuccess;
        this.modalEl.style.width = '90%';
        this.modalEl.style.maxWidth = '600px';
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Import GGUF Model' });
        contentEl.createEl('p', {
            text: 'Select a GGUF file from your filesystem and give it a name. The plugin will import it into Ollama via the create API.',
            cls: 'setting-item-description',
        });

        const fileRow = contentEl.createDiv();
        fileRow.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-bottom: 16px;';

        const fileInput = fileRow.createEl('input', {
            type: 'file',
            attr: { accept: '.gguf' },
        }) as HTMLInputElement;
        fileInput.style.cssText = 'flex: 1;';

        const fileLabel = fileRow.createEl('span', { text: 'No file selected' });
        fileLabel.style.cssText = 'font-size: 0.85em; color: var(--text-muted);';

        fileInput.addEventListener('change', () => {
            const file = fileInput.files?.[0];
            if (file) {
                this.selectedPath = (file as any).path || file.name;
                fileLabel.textContent = file.name;
            }
        });

        new Setting(contentEl)
            .setName('Model name')
            .setDesc('Name for the model in Ollama (e.g., my-model:latest)')
            .addText(text => text
                .setPlaceholder('my-model:latest')
                .onChange(v => { this.modelName = v; })
                .inputEl.addEventListener('input', (e) => {
                    this.modelName = (e.target as HTMLInputElement).value;
                })
            );

        new Setting(contentEl)
            .setName('System prompt (optional)')
            .setDesc('Custom system prompt to bake into the model')
            .addTextArea(text => text
                .setPlaceholder('You are a helpful assistant...')
                .onChange(v => { this.systemPrompt = v; })
            );

        const statusEl = contentEl.createEl('p', { text: '' });
        statusEl.style.cssText = 'font-size: 0.9em; color: var(--text-muted);';

        const btnRow = contentEl.createDiv();
        btnRow.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px;';

        const importBtn = btnRow.createEl('button', { text: 'Import', cls: 'mod-cta' });
        const closeBtn = btnRow.createEl('button', { text: 'Cancel' });

        importBtn.onclick = async () => {
            if (!this.selectedPath) {
                new Notice('Please select a GGUF file');
                return;
            }
            if (!this.modelName.trim()) {
                new Notice('Please enter a model name');
                return;
            }

            importBtn.disabled = true;
            closeBtn.disabled = true;
            statusEl.textContent = 'Importing... this may take a while for large models.';

            const ok = await this.client.importModel(
                this.modelName.trim(),
                this.selectedPath,
                this.systemPrompt || undefined,
            );

            if (ok) {
                statusEl.textContent = '';
                new Notice(`Model "${this.modelName}" imported successfully`);
                this.onSuccess();
                this.close();
            } else {
                statusEl.textContent = 'Import failed. Check Ollama is running and the GGUF path is accessible.';
                importBtn.disabled = false;
                closeBtn.disabled = false;
            }
        };

        closeBtn.onclick = () => this.close();
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
