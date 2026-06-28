import { App, Modal, Setting } from 'obsidian';
import { OllamaClient, ToolDefinition, OllamaMessage } from './ollama-client';
import { VectorDatabase, SearchResult } from './vector-database';
import { WebSearchSettings, getAllToolDefinitions, executeWebSearch, executeFetchUrl } from './web-search-tool';

export class ChatModal extends Modal {
    private query: string = '';
    private database: VectorDatabase;
    private ollama: OllamaClient;
    private embedQuery: (text: string) => Promise<number[][]>;
    private messages: Array<{ role: string; content: string }> = [];
    private webSearchSettings: WebSearchSettings;

    constructor(
        app: App,
        database: VectorDatabase,
        ollama: OllamaClient,
        embedQuery: (text: string) => Promise<number[][]>,
        webSearchSettings?: WebSearchSettings,
    ) {
        super(app);
        this.database = database;
        this.ollama = ollama;
        this.embedQuery = embedQuery;
        this.webSearchSettings = webSearchSettings ?? { enabled: false, provider: 'duckduckgo', googleApiKey: '', googleCx: '' };
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        this.modalEl.style.width = '90%';
        this.modalEl.style.maxWidth = '800px';

        contentEl.createEl('h2', { text: 'Chat with your Vault (Ornith)' });

        // Messages area
        const messagesContainer = contentEl.createDiv('chat-messages');
        messagesContainer.style.cssText = 'max-height: 400px; overflow-y: auto; margin-bottom: 16px; padding: 8px; border: 1px solid var(--background-modifier-border); border-radius: 5px;';

        // Input area
        const inputContainer = contentEl.createDiv('chat-input-container');
        inputContainer.style.cssText = 'display: flex; gap: 8px;';

        const input = inputContainer.createEl('input', {
            type: 'text',
            placeholder: 'Ask about your notes...',
        });
        input.style.cssText = 'flex: 1; padding: 8px; border-radius: 4px; border: 1px solid var(--background-modifier-border); background: var(--background-primary); color: var(--text-normal);';

        const sendBtn = inputContainer.createEl('button', { text: 'Send' });
        sendBtn.style.cssText = 'padding: 8px 16px; background: var(--interactive-accent); color: var(--text-on-accent); border: none; border-radius: 4px; cursor: pointer;';

        const sendMessage = async () => {
            const q = input.value.trim();
            if (!q) return;

            input.value = '';
            this.addMessageBubble(messagesContainer, q, 'user');
            input.disabled = true;
            sendBtn.disabled = true;
            sendBtn.textContent = 'Thinking...';

            try {
                // Search vector DB for relevant notes
                const queryEmbedding = await this.embedQuery(q);
                const searchResults = this.database.search(queryEmbedding[0], 5, 0.2);

                const context = searchResults
                    .map(r => {
                        const m = r.entry.metadata;
                        return `## ${m.path}\n\n${m.content}`;
                    })
                    .join('\n\n---\n\n');

                const oaiMessages: OllamaMessage[] = [
                    {
                        role: 'system',
                        content: `You are an AI assistant with access to the user's Obsidian vault notes. Use the provided notes as context to answer questions. If the notes don't contain the answer, say so. Be concise.\n\nRelevant notes from vault:\n\n${context || '(No relevant notes found)'}`,
                    },
                    ...this.messages.map(m => ({
                        role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
                        content: m.content,
                    })),
                    { role: 'user', content: q },
                ];

                const bubble = this.createBubble(messagesContainer, '', 'assistant');
                const contentDiv = bubble.querySelector('.chat-bubble-content')!;

                let fullResponse: string;

                if (this.webSearchSettings.enabled) {
                    const tools: ToolDefinition[] = getAllToolDefinitions();

                    const searchStatus = contentEl.createEl('div', {
                        text: '---',
                    });
                    searchStatus.style.cssText = 'font-size: 0.8em; color: var(--text-muted); margin-bottom: 4px;';

                    fullResponse = await this.ollama.chatWithTools(
                        oaiMessages,
                        tools,
                        async (name, args) => {
                            if (name === 'web_search') {
                                searchStatus.textContent = `Searching web for: "${args.query}"...`;
                                const result = await executeWebSearch(
                                    args.query || '',
                                    this.webSearchSettings,
                                    args.maxResults || 5,
                                );
                                searchStatus.textContent = '';
                                return result;
                            }
                            if (name === 'fetch_url') {
                                searchStatus.textContent = `Fetching: ${args.url}...`;
                                const result = await executeFetchUrl(args.url || '');
                                searchStatus.textContent = '';
                                return result;
                            }
                            return `Unknown tool: ${name}`;
                        },
                        (chunk) => {
                            contentDiv.textContent += chunk;
                            messagesContainer.scrollTop = messagesContainer.scrollHeight;
                        },
                    );

                    searchStatus.remove();
                } else {
                    fullResponse = await this.ollama.chat(oaiMessages, (chunk) => {
                        contentDiv.textContent += chunk;
                        messagesContainer.scrollTop = messagesContainer.scrollHeight;
                    });
                }

                this.messages.push({ role: 'user', content: q });
                this.messages.push({ role: 'assistant', content: fullResponse });
            } catch (e) {
                this.addMessageBubble(messagesContainer, `Error: ${e.message}`, 'error');
            }

            input.disabled = false;
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send';
            input.focus();
        };

        sendBtn.addEventListener('click', sendMessage);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendMessage();
        });

        // Connection status
        this.ollama.checkConnection().then(ok => {
            if (!ok) {
                const warn = contentEl.createEl('div', {
                    text: '⚠️ Ornith model not found in Ollama. Make sure Ollama is running and the model is pulled.',
                    cls: 'chat-warning',
                });
                warn.style.cssText = 'color: var(--text-warning); font-size: 0.9em; margin-top: 8px; padding: 8px; background: var(--background-modifier-warning); border-radius: 4px;';
            }
        });

        setTimeout(() => input.focus(), 100);
    }

    private addMessageBubble(container: HTMLElement, text: string, role: string) {
        const bubble = this.createBubble(container, text, role);
        container.appendChild(bubble);
        container.scrollTop = container.scrollHeight;
    }

    private createBubble(container: HTMLElement, text: string, role: string): HTMLDivElement {
        const existing = container.querySelector(`.chat-bubble[data-role="${role}"]:last-child`);
        if (existing && text === '' && role === 'assistant') {
            return existing as HTMLDivElement;
        }

        const bubble = container.createDiv('chat-bubble');
        bubble.setAttribute('data-role', role);
        bubble.style.cssText = `
            margin: 8px 0; padding: 8px 12px; border-radius: 8px;
            max-width: 85%; word-wrap: break-word; white-space: pre-wrap;
            ${role === 'user'
                ? 'margin-left: auto; background: var(--interactive-accent); color: var(--text-on-accent);'
                : role === 'error'
                ? 'background: var(--background-modifier-error); color: var(--text-on-accent);'
                : 'background: var(--background-secondary); color: var(--text-normal);'}
        `;

        const content = bubble.createDiv('chat-bubble-content');
        content.textContent = text;
        return bubble;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
