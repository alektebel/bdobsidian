import { App, Menu, Notice, TFile } from 'obsidian';
import { OllamaClient, OllamaMessage } from './ollama-client';
import { OrganizeSuggestion } from './raw-note-organizer';
import { OrganizeApprovalModal } from './organize-approval-modal';

export interface ModelAction {
    id: string;
    name: string;
    icon?: string;
    execute: (file: TFile, modelName: string, app: App, ollamaUrl: string) => Promise<void>;
}

export class ContextMenuHarness {
    private app: App;
    private ollamaUrl: string;
    private actions: ModelAction[] = [];
    private modelCache: { models: string[]; timestamp: number } | null = null;
    private cacheTtl = 60000;

    constructor(app: App, ollamaUrl: string) {
        this.app = app;
        this.ollamaUrl = ollamaUrl;
    }

    registerAction(action: ModelAction) {
        this.actions.push(action);
    }

    setOllamaUrl(url: string) {
        this.ollamaUrl = url;
        this.modelCache = null;
    }

    registerFileMenu() {
        this.app.workspace.on('file-menu', (menu: Menu, file) => {
            if (!(file instanceof TFile) || file.extension !== 'md') return;

            for (const action of this.actions) {
                const item = menu.addItem((item) => {
                    item.setTitle(action.name);
                    if (action.icon) item.setIcon(action.icon);

                    const submenu = item.setSubmenu();
                    submenu.addItem((loading) => {
                        loading.setTitle('Loading models...');
                        loading.setDisabled(true);
                    });

                    this.getModels().then((models) => {
                        item.dom.removeChild(submenu.dom);
                        const fresh = item.setSubmenu();

                        if (models.length === 0) {
                            fresh.addItem((none) => {
                                none.setTitle('No models available');
                                none.setDisabled(true);
                            });
                            return;
                        }

                        for (const model of models) {
                            fresh.addItem((mItem) => {
                                mItem.setTitle(model);
                                mItem.onClick(() => {
                                    new Notice(`${action.name} ${model}...`);
                                    action.execute(file, model, this.app, this.ollamaUrl);
                                });
                            });
                        }
                    });
                });
            }
        });
    }

    private async getModels(): Promise<string[]> {
        if (this.modelCache && Date.now() - this.modelCache.timestamp < this.cacheTtl) {
            return this.modelCache.models;
        }
        const client = new OllamaClient(this.ollamaUrl);
        const models = await client.listModels();
        this.modelCache = { models, timestamp: Date.now() };
        return models;
    }
}

export const organizeAction: ModelAction = {
    id: 'organize',
    name: 'Organize with...',
    icon: 'folder-input',
    execute: async (file, modelName, app, ollamaUrl) => {
        const client = new OllamaClient(ollamaUrl, modelName);
        const content = await app.vault.read(file);

        const prompt = `You are a note organization assistant for Obsidian. Given a note, analyze it and suggest:
1. Which folder it should be moved to (use existing folder names or suggest a new one)
2. 2-4 relevant tags (prefix with #)
3. Backlinks to 1-3 existing notes that are related (use [[wikilink]] format)

Return ONLY valid JSON with this exact shape:
{"folder": "string", "tags": ["#tag1", "#tag2"], "backlinks": ["[[Note Name]]"], "reason": "brief explanation"}

Do not include any other text or markdown formatting.`;

        const messages: OllamaMessage[] = [
            { role: 'system', content: prompt },
            { role: 'user', content: `Note title: ${file.basename}\n\nContent:\n${content}` },
        ];

        const response = await client.chat(messages);

        const match = response.match(/\{[\s\S]*\}/);
        if (!match) {
            new Notice('Could not parse organization suggestion');
            return;
        }

        let json: Record<string, unknown>;
        try {
            json = JSON.parse(match[0]);
        } catch {
            new Notice('Could not parse organization suggestion');
            return;
        }

        const suggestion: OrganizeSuggestion = {
            file,
            content,
            suggestedFolder: (json.folder as string) || 'inbox',
            tags: Array.isArray(json.tags) ? json.tags as string[] : [],
            backlinks: Array.isArray(json.backlinks) ? json.backlinks as string[] : [],
            reason: (json.reason as string) || '',
        };

        const modal = new OrganizeApprovalModal(
            app,
            [suggestion],
            async (s) => {
                try {
                    const destFolder = s.suggestedFolder.replace(/\/?$/, '/');
                    const destPath = `${destFolder}${s.file.basename}.md`;

                    let finalContent = s.content;
                    const fmMatch = finalContent.match(/^---\n[\s\S]*?\n---\n/);
                    let frontmatter = fmMatch ? fmMatch[0] : '';
                    let body = fmMatch ? finalContent.slice(fmMatch[0].length) : finalContent;

                    if (s.tags.length > 0) {
                        if (frontmatter) {
                            if (!frontmatter.includes('tags:')) {
                                const tagLine = `tags:\n${s.tags.map(t => `  - ${t.replace(/^#/, '')}`).join('\n')}\n`;
                                frontmatter = frontmatter.replace(/^---\n/, '---\n' + tagLine);
                            }
                        } else {
                            const tagLine = `tags:\n${s.tags.map(t => `  - ${t.replace(/^#/, '')}`).join('\n')}\n`;
                            frontmatter = `---\n${tagLine}---\n`;
                        }
                    }

                    if (s.backlinks.length > 0) {
                        body = body.trimEnd() + '\n\n## Related\n' + s.backlinks.join(' ') + '\n';
                    }

                    finalContent = frontmatter + body;

                    const folder = destFolder.replace(/\/$/, '');
                    if (folder) {
                        await app.vault.createFolder(folder).catch(() => {});
                    }

                    const existing = app.vault.getAbstractFileByPath(destPath);
                    if (existing instanceof TFile) {
                        new Notice(`File already exists at ${destPath}`);
                        return false;
                    }

                    await app.vault.create(destPath, finalContent);
                    await app.vault.delete(s.file);
                    return true;
                } catch (error) {
                    console.error('Apply failed:', error);
                    return false;
                }
            },
        );
        modal.open();
    },
};

export const summarizeAction: ModelAction = {
    id: 'summarize',
    name: 'Summarize with...',
    icon: 'align-left',
    execute: async (file, modelName, app, ollamaUrl) => {
        const client = new OllamaClient(ollamaUrl, modelName);
        const content = await app.vault.read(file);

        const messages: OllamaMessage[] = [
            { role: 'system', content: 'You summarize notes concisely. Return only the summary, no extra text.' },
            { role: 'user', content: `Summarize this note:\n\n${content}` },
        ];

        const summary = await client.chat(messages);
        const summaryFile = `${file.parent?.path || ''}/${file.basename}-summary.md`.replace(/^\//, '');
        await app.vault.create(summaryFile, `# Summary of ${file.basename}\n\n${summary}`);
        new Notice(`Summary created: ${summaryFile}`);
    },
};
