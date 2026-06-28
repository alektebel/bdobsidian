import { TFile, Vault } from 'obsidian';
import { EmbeddingModel } from './embedding-model';
import { VectorDatabase, VectorEntry } from './vector-database';

export interface IndexerSettings {
    chunkSize: number;
    chunkOverlap: number;
    excludePatterns: string[];
}

export class NoteIndexer {
    private vault: Vault;
    private model: EmbeddingModel;
    private database: VectorDatabase;
    private settings: IndexerSettings;

    constructor(
        vault: Vault,
        model: EmbeddingModel,
        database: VectorDatabase,
        settings: IndexerSettings
    ) {
        this.vault = vault;
        this.model = model;
        this.database = database;
        this.settings = settings;
    }

    // Split text into chunks with overlap
    private chunkText(text: string, chunkSize: number, overlap: number): string[] {
        if (text.length <= chunkSize) {
            return [text];
        }

        const chunks: string[] = [];
        let start = 0;

        while (start < text.length) {
            const end = Math.min(start + chunkSize, text.length);
            const chunk = text.slice(start, end);
            chunks.push(chunk);

            if (end === text.length) break;
            start += chunkSize - overlap;
        }

        return chunks;
    }

    // Check if file should be excluded
    private shouldExclude(path: string): boolean {
        return this.settings.excludePatterns.some(pattern => {
            const regex = new RegExp(pattern);
            return regex.test(path);
        });
    }

    // Index a single note
    async indexNote(file: TFile, forceReindex: boolean = false): Promise<void> {
        try {
            // Check if should be excluded
            if (this.shouldExclude(file.path)) {
                console.log(`Skipping excluded file: ${file.path}`);
                return;
            }

            // Check if already indexed and up-to-date
            const existingVectors = this.database.getVectors(file.path);
            if (!forceReindex && existingVectors && existingVectors.length > 0) {
                const lastMtime = existingVectors[0].metadata.mtime;
                if (lastMtime === file.stat.mtime) {
                    console.log(`File already indexed and up-to-date: ${file.path}`);
                    return;
                }
            }

            // Read file content
            const content = await this.vault.read(file);
            
            if (!content || content.trim().length === 0) {
                console.log(`Skipping empty file: ${file.path}`);
                return;
            }

            // Split into chunks
            const chunks = this.chunkText(
                content,
                this.settings.chunkSize,
                this.settings.chunkOverlap
            );

            console.log(`Indexing ${file.path} (${chunks.length} chunks)`);

            // Generate embeddings for all chunks
            const embeddings = await this.model.embed(chunks);

            // Create vector entries
            const entries: VectorEntry[] = chunks.map((chunk, index) => ({
                id: `${file.path}:${index}`,
                vector: embeddings[index],
                metadata: {
                    path: file.path,
                    content: chunk,
                    mtime: file.stat.mtime,
                    title: file.basename,
                    chunkIndex: index
                }
            }));

            // Store in database
            this.database.addVectors(file.path, entries);
            
            console.log(`Successfully indexed: ${file.path}`);
        } catch (error) {
            console.error(`Error indexing ${file.path}:`, error);
            throw error;
        }
    }

    // Index all notes in vault
    async indexAllNotes(
        progressCallback?: (current: number, total: number, fileName: string) => void
    ): Promise<void> {
        const files = this.vault.getMarkdownFiles();
        const totalFiles = files.length;

        console.log(`Starting indexing of ${totalFiles} files`);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            
            if (progressCallback) {
                progressCallback(i + 1, totalFiles, file.basename);
            }

            try {
                await this.indexNote(file, false);
            } catch (error) {
                console.error(`Failed to index ${file.path}:`, error);
                // Continue with next file
            }
        }

        console.log('Indexing completed');
    }

    // Remove note from index
    removeNote(filePath: string): void {
        this.database.removeVectors(filePath);
        console.log(`Removed from index: ${filePath}`);
    }

    // Update note index (re-index if changed)
    async updateNote(file: TFile): Promise<void> {
        await this.indexNote(file, true);
    }

    // Get indexing statistics
    getStats() {
        return this.database.getStats();
    }
}
