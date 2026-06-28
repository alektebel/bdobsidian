import { App, Notice, TFile, TFolder } from 'obsidian';
import { OllamaClient, OllamaMessage } from './ollama-client';

export interface OrganizeSuggestion {
    file: TFile;
    content: string;
    suggestedFolder: string;
    tags: string[];
    backlinks: string[];
    reason: string;
}

export interface OrganizerSettings {
    rawFolder: string;
    intervalMinutes: number;
    enabled: boolean;
    requireApproval: boolean;
}

export const DEFAULT_ORGANIZER_SETTINGS: OrganizerSettings = {
    rawFolder: 'raw',
    intervalMinutes: 120,
    enabled: true,
    requireApproval: true,
};

const ORGANIZE_SYSTEM_PROMPT = `You are a note organization assistant for Obsidian. Given a note from a "raw" inbox folder, analyze it and suggest:
1. Which folder it should be moved to (use existing folder names or suggest a new one)
2. 2-4 relevant tags (prefix with #)
3. Backlinks to 1-3 existing notes that are related (use [[wikilink]] format)

Return ONLY valid JSON with this exact shape:
{"folder": "string", "tags": ["#tag1", "#tag2"], "backlinks": ["[[Note Name]]"], "reason": "brief explanation"}

Do not include any other text or markdown formatting.`;

export class RawNoteOrganizer {
    private app: App;
    private ollama: OllamaClient;
    private settings: OrganizerSettings;

    constructor(app: App, ollama: OllamaClient, settings: OrganizerSettings) {
        this.app = app;
        this.ollama = ollama;
        this.settings = settings;
    }

    updateSettings(settings: OrganizerSettings) {
        this.settings = settings;
    }

    async findRawNotes(): Promise<TFile[]> {
        const folder = this.app.vault.getAbstractFileByPath(this.settings.rawFolder);
        if (!folder || !(folder instanceof TFolder)) {
            return [];
        }

        const notes: TFile[] = [];
        for (const child of folder.children) {
            if (child instanceof TFile && child.extension === 'md') {
                notes.push(child);
            }
        }
        return notes;
    }

    async analyzeNote(file: TFile): Promise<OrganizeSuggestion | null> {
        const content = await this.app.vault.read(file);

        const messages: OllamaMessage[] = [
            { role: 'system', content: ORGANIZE_SYSTEM_PROMPT },
            { role: 'user', content: `Note title: ${file.basename}\n\nContent:\n${content}` },
        ];

        const response = await this.ollama.chat(messages);
        const json = this.extractJson(response);

        if (!json) {
            new Notice(`Could not parse organization suggestion for ${file.basename}`);
            return null;
        }

        return {
            file,
            content,
            suggestedFolder: json.folder || 'inbox',
            tags: Array.isArray(json.tags) ? json.tags : [],
            backlinks: Array.isArray(json.backlinks) ? json.backlinks : [],
            reason: json.reason || '',
        };
    }

    async applySuggestion(suggestion: OrganizeSuggestion): Promise<boolean> {
        try {
            const folderPath = this.settings.rawFolder;
            const destFolder = suggestion.suggestedFolder.replace(/\/?$/, '/');
            const destPath = `${destFolder}${suggestion.file.basename}.md`;

            let finalContent = suggestion.content;

            const frontmatterMatch = finalContent.match(/^---\n[\s\S]*?\n---\n/);
            let frontmatter = frontmatterMatch ? frontmatterMatch[0] : '';
            let body = frontmatterMatch ? finalContent.slice(frontmatterMatch[0].length) : finalContent;

            if (suggestion.tags.length > 0) {
                if (frontmatter) {
                    if (!frontmatter.includes('tags:')) {
                        const tagLine = `tags:\n${suggestion.tags.map(t => `  - ${t.replace(/^#/, '')}`).join('\n')}\n`;
                        frontmatter = frontmatter.replace(/^---\n/, '---\n' + tagLine);
                    }
                } else {
                    const tagLine = `tags:\n${suggestion.tags.map(t => `  - ${t.replace(/^#/, '')}`).join('\n')}\n`;
                    frontmatter = `---\n${tagLine}---\n`;
                }
            }

            if (suggestion.backlinks.length > 0) {
                body = body.trimEnd() + '\n\n## Related\n' + suggestion.backlinks.join(' ') + '\n';
            }

            finalContent = frontmatter + body;

            await this.app.vault.createFolder(destFolder).catch(() => {});

            const existing = this.app.vault.getAbstractFileByPath(destPath);
            if (existing instanceof TFile) {
                new Notice(`File already exists at ${destPath}. Skipping.`);
                return false;
            }

            await this.app.vault.create(destPath, finalContent);
            await this.app.vault.delete(suggestion.file);
            return true;
        } catch (error) {
            console.error('Failed to apply suggestion:', error);
            return false;
        }
    }

    private extractJson(text: string): Record<string, unknown> | null {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) return null;
        try {
            return JSON.parse(match[0]) as Record<string, unknown>;
        } catch {
            return null;
        }
    }
}
