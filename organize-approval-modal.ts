import { App, Modal, Notice } from 'obsidian';
import { OrganizeSuggestion } from './raw-note-organizer';

export class OrganizeApprovalModal extends Modal {
    private suggestions: OrganizeSuggestion[];
    private onApply: (suggestion: OrganizeSuggestion) => Promise<boolean>;
    private results: { suggestion: OrganizeSuggestion; applied: boolean }[] = [];

    constructor(
        app: App,
        suggestions: OrganizeSuggestion[],
        onApply: (suggestion: OrganizeSuggestion) => Promise<boolean>,
    ) {
        super(app);
        this.suggestions = suggestions;
        this.onApply = onApply;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.modalEl.style.width = '90%';
        this.modalEl.style.maxWidth = '700px';

        contentEl.createEl('h2', { text: `Organize ${this.suggestions.length} Raw Note(s)` });

        const listEl = contentEl.createDiv('organize-list');
        listEl.style.cssText = 'max-height: 500px; overflow-y: auto; margin-bottom: 16px;';

        for (const s of this.suggestions) {
            this.renderSuggestionCard(listEl, s);
        }

        const btnRow = contentEl.createDiv('organize-buttons');
        btnRow.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end;';

        const applyAllBtn = btnRow.createEl('button', { text: 'Apply All', cls: 'mod-cta' });
        applyAllBtn.onclick = async () => {
            applyAllBtn.disabled = true;
            for (const s of this.suggestions) {
                const ok = await this.onApply(s);
                this.results.push({ suggestion: s, applied: ok });
            }
            new Notice(`Applied ${this.results.filter(r => r.applied).length}/${this.suggestions.length} suggestions`);
            this.close();
        };

        const closeBtn = btnRow.createEl('button', { text: 'Close' });
        closeBtn.onclick = () => this.close();
    }

    private renderSuggestionCard(container: HTMLElement, s: OrganizeSuggestion) {
        const card = container.createDiv('organize-card');
        card.style.cssText = 'border: 1px solid var(--background-modifier-border); border-radius: 6px; padding: 12px; margin-bottom: 12px;';

        const header = card.createEl('strong', { text: s.file.basename });
        header.style.cssText = 'font-size: 1.1em; display: block; margin-bottom: 8px;';

        const detail = card.createDiv();
        detail.style.cssText = 'font-size: 0.9em; color: var(--text-muted);';

        detail.createEl('p', { text: `Move to: ${s.suggestedFolder}/` });
        detail.createEl('p', { text: `Tags: ${s.tags.join(' ') || '(none)'}` });
        detail.createEl('p', { text: `Backlinks: ${s.backlinks.join(' ') || '(none)'}` });
        detail.createEl('p', { text: `Why: ${s.reason}` });

        const preview = card.createEl('details');
        const summary = preview.createEl('summary', { text: 'Preview content' });
        summary.style.cssText = 'cursor: pointer; margin-top: 8px; color: var(--text-accent);';
        preview.createEl('pre', {
            text: s.content.length > 300 ? s.content.slice(0, 300) + '...' : s.content,
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
