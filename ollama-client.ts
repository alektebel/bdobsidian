export interface OllamaMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface ChatResponse {
    message: OllamaMessage;
    done: boolean;
}

export class OllamaClient {
    private baseUrl: string;
    private model: string;

    constructor(baseUrl: string = 'http://localhost:11436', model: string = 'ornith-35b') {
        this.baseUrl = baseUrl;
        this.model = model;
    }

    setModel(model: string) {
        this.model = model;
    }

    setBaseUrl(url: string) {
        this.baseUrl = url;
    }

    async chat(messages: OllamaMessage[], onChunk?: (text: string) => void): Promise<string> {
        const body = JSON.stringify({
            model: this.model,
            messages: messages,
            stream: onChunk != null,
            options: {
                temperature: 0.6,
                num_predict: 4096,
            },
        });

        if (onChunk) {
            return this.streamChat(body, onChunk);
        }

        const resp = await fetch(`${this.baseUrl}/api/chat`, {
            method: 'POST',
            body,
        });
        const data = await resp.json();
        return data.message?.content ?? '';
    }

    private async streamChat(body: string, onChunk: (text: string) => void): Promise<string> {
        const resp = await fetch(`${this.baseUrl}/api/chat`, {
            method: 'POST',
            body,
        });

        const reader = resp.body!.getReader();
        const decoder = new TextDecoder();
        let full = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(l => l.trim());

            for (const line of lines) {
                try {
                    const data = JSON.parse(line);
                    if (data.message?.content) {
                        full += data.message.content;
                        onChunk(data.message.content);
                    }
                } catch { }
            }
        }

        return full;
    }

    async checkConnection(): Promise<boolean> {
        try {
            const resp = await fetch(`${this.baseUrl}/api/tags`);
            const data = await resp.json();
            return data.models?.some((m: any) => m.name.includes(this.model)) ?? false;
        } catch {
            return false;
        }
    }
}
