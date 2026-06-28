export type SearchProvider = 'duckduckgo' | 'google';

export interface WebSearchSettings {
    enabled: boolean;
    provider: SearchProvider;
    googleApiKey: string;
    googleCx: string;
}

export const DEFAULT_WEB_SEARCH_SETTINGS: WebSearchSettings = {
    enabled: true,
    provider: 'duckduckgo',
    googleApiKey: '',
    googleCx: '',
};

export interface WebSearchResult {
    title: string;
    url: string;
    snippet: string;
}

export function getSearchToolDefinition() {
    return {
        type: 'function' as const,
        function: {
            name: 'web_search',
            description: 'Search the web for current information. Use this when you need up-to-date information, recent events, or facts outside the user\'s notes.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The search query',
                    },
                    maxResults: {
                        type: 'number',
                        description: 'Maximum number of results to return (default: 5)',
                    },
                },
                required: ['query'],
            },
        },
    };
}

export function getFetchUrlToolDefinition() {
    return {
        type: 'function' as const,
        function: {
            name: 'fetch_url',
            description: 'Fetch and read the content of a URL. Use this to get the full text of a web page, article, or API response. Returns the page text content.',
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'The full URL to fetch (including https://)',
                    },
                },
                required: ['url'],
            },
        },
    };
}

export function getAllToolDefinitions() {
    return [getSearchToolDefinition(), getFetchUrlToolDefinition()];
}

export async function executeWebSearch(
    query: string,
    settings: WebSearchSettings,
    maxResults: number = 5,
): Promise<string> {
    let results: WebSearchResult[];

    switch (settings.provider) {
        case 'google':
            results = await googleSearch(query, settings.googleApiKey, settings.googleCx, maxResults);
            break;
        case 'duckduckgo':
        default:
            results = await duckduckgoSearch(query, maxResults);
            break;
    }

    if (results.length === 0) {
        return 'No search results found.';
    }

    return results
        .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`)
        .join('\n\n');
}

async function duckduckgoSearch(query: string, maxResults: number): Promise<WebSearchResult[]> {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const resp = await fetch(url);
    const data = await resp.json();

    const results: WebSearchResult[] = [];

    if (data.AbstractText) {
        results.push({
            title: data.Headline || data.AbstractSource || 'Summary',
            url: data.AbstractURL || '',
            snippet: data.AbstractText,
        });
    }

    if (data.RelatedTopics) {
        for (const topic of data.RelatedTopics) {
            if (results.length >= maxResults) break;
            if (topic.Text) {
                results.push({
                    title: topic.Text.split(' - ')[0] || topic.FirstURL || '',
                    url: topic.FirstURL || '',
                    snippet: topic.Text,
                });
            }
            if (topic.Topics) {
                for (const sub of topic.Topics) {
                    if (results.length >= maxResults) break;
                    if (sub.Text) {
                        results.push({
                            title: sub.Text.split(' - ')[0] || sub.FirstURL || '',
                            url: sub.FirstURL || '',
                            snippet: sub.Text,
                        });
                    }
                }
            }
        }
    }

    return results;
}

async function googleSearch(query: string, apiKey: string, cx: string, maxResults: number): Promise<WebSearchResult[]> {
    const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(apiKey)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(query)}&num=${Math.min(maxResults, 10)}`;
    const resp = await fetch(url);
    const data = await resp.json();

    if (!data.items) {
        return [];
    }

    return data.items.slice(0, maxResults).map((item: any) => ({
        title: item.title || '',
        url: item.link || '',
        snippet: item.snippet || '',
    }));
}

export async function executeFetchUrl(url: string): Promise<string> {
    try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
        const text = await resp.text();

        const content = text
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        const maxLen = 8000;
        const trimmed = content.length > maxLen ? content.slice(0, maxLen) + '...' : content;
        return trimmed || '(empty page)';
    } catch (e: any) {
        return `Error fetching URL: ${e.message}`;
    }
}
