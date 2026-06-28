export interface VectorEntry {
    id: string;
    vector: number[];
    metadata: {
        path: string;
        content: string;
        mtime: number;
        title: string;
        chunkIndex?: number;
    };
}

export interface SearchResult {
    entry: VectorEntry;
    similarity: number;
}

export class VectorDatabase {
    private entries: Map<string, VectorEntry[]> = new Map();
    private dimension: number;

    constructor(dimension: number) {
        this.dimension = dimension;
    }

    // Add or update vector entries for a document
    addVectors(filePath: string, entries: VectorEntry[]): void {
        this.entries.set(filePath, entries);
    }

    // Remove vectors for a document
    removeVectors(filePath: string): void {
        this.entries.delete(filePath);
    }

    // Get vectors for a document
    getVectors(filePath: string): VectorEntry[] | undefined {
        return this.entries.get(filePath);
    }

    // Check if document is indexed
    hasDocument(filePath: string): boolean {
        return this.entries.has(filePath);
    }

    // Get all documents in the database
    getAllDocuments(): string[] {
        return Array.from(this.entries.keys());
    }

    // Calculate cosine similarity between two vectors
    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            throw new Error('Vectors must have the same dimension');
        }

        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        normA = Math.sqrt(normA);
        normB = Math.sqrt(normB);

        if (normA === 0 || normB === 0) {
            return 0;
        }

        return dotProduct / (normA * normB);
    }

    // Search for similar vectors
    search(queryVector: number[], topK: number = 10, threshold: number = 0.0): SearchResult[] {
        const results: SearchResult[] = [];

        for (const [_, docEntries] of this.entries) {
            for (const entry of docEntries) {
                const similarity = this.cosineSimilarity(queryVector, entry.vector);
                
                if (similarity >= threshold) {
                    results.push({ entry, similarity });
                }
            }
        }

        // Sort by similarity (descending)
        results.sort((a, b) => b.similarity - a.similarity);

        // Return top K results
        return results.slice(0, topK);
    }

    // Get total number of vectors
    getTotalVectors(): number {
        let count = 0;
        for (const [_, entries] of this.entries) {
            count += entries.length;
        }
        return count;
    }

    // Clear all vectors
    clear(): void {
        this.entries.clear();
    }

    // Export database to JSON
    toJSON(): any {
        const data: any = {
            dimension: this.dimension,
            entries: {}
        };

        for (const [path, entries] of this.entries) {
            data.entries[path] = entries;
        }

        return data;
    }

    // Import database from JSON
    static fromJSON(data: any): VectorDatabase {
        const db = new VectorDatabase(data.dimension);
        
        for (const [path, entries] of Object.entries(data.entries)) {
            db.entries.set(path, entries as VectorEntry[]);
        }

        return db;
    }

    // Get database statistics
    getStats(): {
        totalDocuments: number;
        totalVectors: number;
        dimension: number;
        avgVectorsPerDocument: number;
    } {
        const totalDocuments = this.entries.size;
        const totalVectors = this.getTotalVectors();
        
        return {
            totalDocuments,
            totalVectors,
            dimension: this.dimension,
            avgVectorsPerDocument: totalDocuments > 0 ? totalVectors / totalDocuments : 0
        };
    }
}
