export interface OllamaMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_calls?: OllamaToolCall[];
}

export interface OllamaToolCall {
    function: {
        name: string;
        arguments: string;
    };
}

export interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: object;
    };
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

    async chat(
        messages: OllamaMessage[],
        onChunk?: (text: string) => void,
        tools?: ToolDefinition[],
    ): Promise<string> {
        const bodyObj: any = {
            model: this.model,
            messages: messages,
            stream: onChunk != null,
            options: {
                temperature: 0.6,
                num_predict: 4096,
            },
        };

        if (tools && tools.length > 0) {
            bodyObj.tools = tools;
        }

        const body = JSON.stringify(bodyObj);

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

    async chatWithTools(
        messages: OllamaMessage[],
        tools: ToolDefinition[],
        executeTool: (name: string, args: any) => Promise<string>,
        onChunk?: (text: string) => void,
    ): Promise<string> {
        const bodyObj: any = {
            model: this.model,
            messages: messages,
            stream: false,
            options: {
                temperature: 0.6,
                num_predict: 4096,
            },
            tools: tools,
        };

        const body = JSON.stringify(bodyObj);

        const resp = await fetch(`${this.baseUrl}/api/chat`, {
            method: 'POST',
            body,
        });
        const data = await resp.json();

        const toolCalls: OllamaToolCall[] | undefined = data.message?.tool_calls;

        if (toolCalls && toolCalls.length > 0) {
            messages.push({ role: 'assistant', content: data.message?.content ?? '', tool_calls: toolCalls });

            for (const tc of toolCalls) {
                let args: any;
                try {
                    args = JSON.parse(tc.function.arguments);
                } catch {
                    args = { query: tc.function.arguments };
                }
                const result = await executeTool(tc.function.name, args);
                messages.push({ role: 'tool', content: result });
            }

            return this.chatWithTools(messages, tools, executeTool, onChunk);
        }

        const content = data.message?.content ?? '';
        if (onChunk) {
            onChunk(content);
        }
        return content;
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

    async listModels(): Promise<string[]> {
        try {
            const resp = await fetch(`${this.baseUrl}/api/tags`);
            const data = await resp.json();
            if (!Array.isArray(data.models)) return [];
            return data.models.map((m: any) => m.name);
        } catch {
            return [];
        }
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
