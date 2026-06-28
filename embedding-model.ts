import { pipeline, env } from '@xenova/transformers';

// Configure transformers.js to use local models
env.allowLocalModels = true;
env.allowRemoteModels = true;

export interface EmbeddingModel {
    embed(text: string | string[]): Promise<number[][]>;
    getDimension(): number;
}

export class TransformersEmbeddingModel implements EmbeddingModel {
    private extractor: any;
    private modelName: string;
    private dimension: number;

    constructor(modelName: string, dimension: number = 384) {
        this.modelName = modelName;
        this.dimension = dimension;
    }

    async initialize(): Promise<void> {
        try {
            console.log(`Loading embedding model: ${this.modelName}`);
            this.extractor = await pipeline('feature-extraction', this.modelName);
            console.log('Model loaded successfully');
        } catch (error) {
            console.error('Error loading model:', error);
            throw error;
        }
    }

    async embed(text: string | string[]): Promise<number[][]> {
        if (!this.extractor) {
            throw new Error('Model not initialized. Call initialize() first.');
        }

        const texts = Array.isArray(text) ? text : [text];
        const embeddings: number[][] = [];

        for (const t of texts) {
            const output = await this.extractor(t, { pooling: 'mean', normalize: true });
            const embedding = Array.from(output.data);
            embeddings.push(embedding);
        }

        return embeddings;
    }

    getDimension(): number {
        return this.dimension;
    }
}

export class ModelLoader {
    private models: Map<string, EmbeddingModel> = new Map();

    async loadModel(modelPath: string, modelName?: string): Promise<EmbeddingModel> {
        const name = modelName || modelPath;
        
        if (this.models.has(name)) {
            return this.models.get(name)!;
        }

        // Default models and their dimensions
        const modelDimensions: Record<string, number> = {
            'Xenova/all-MiniLM-L6-v2': 384,
            'Xenova/all-MiniLM-L12-v2': 384,
            'Xenova/paraphrase-multilingual-MiniLM-L12-v2': 384,
            'sentence-transformers/all-MiniLM-L6-v2': 384,
        };

        const dimension = modelDimensions[modelPath] || 384;
        const model = new TransformersEmbeddingModel(modelPath, dimension);
        await model.initialize();
        
        this.models.set(name, model);
        return model;
    }

    getModel(name: string): EmbeddingModel | undefined {
        return this.models.get(name);
    }

    async unloadModel(name: string): Promise<void> {
        this.models.delete(name);
    }
}
