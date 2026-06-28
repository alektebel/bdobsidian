import { Notice } from 'obsidian';
import { exec } from 'child_process';

export interface GitStatus {
    dirty: number;
    staged: number;
    ahead: number;
    behind: number;
    branch: string;
    hasRemotes: boolean;
}

export class GitSync {
    private repoPath: string;
    private available: boolean | null = null;

    constructor(repoPath: string) {
        this.repoPath = repoPath;
    }

    async isAvailable(): Promise<boolean> {
        if (this.available !== null) return this.available;
        try {
            const result = await this.run('git --version');
            this.available = result !== null;
            return this.available;
        } catch {
            this.available = false;
            return false;
        }
    }

    async getStatus(): Promise<GitStatus | null> {
        const ok = await this.isAvailable();
        if (!ok) return null;

        const branch = await this.run('git rev-parse --abbrev-ref HEAD');
        if (!branch) return null;

        const [dirtyRaw, stagedRaw] = await Promise.all([
            this.run('git status --porcelain'),
            this.run('git diff --cached --stat'),
        ]);

        const dirty = dirtyRaw ? dirtyRaw.split('\n').filter(l => l.trim()).length : 0;
        const staged = stagedRaw ? stagedRaw.split('\n').filter(l => l.trim()).length : 0;

        const remoteRaw = await this.run('git rev-list --left-right --count HEAD...@{upstream}');
        let ahead = 0;
        let behind = 0;
        if (remoteRaw) {
            const parts = remoteRaw.trim().split(/\s+/);
            ahead = parseInt(parts[0]) || 0;
            behind = parseInt(parts[1]) || 0;
        }

        const remotesRaw = await this.run('git remote -v');

        return {
            dirty,
            staged,
            ahead,
            behind,
            branch: branch.trim(),
            hasRemotes: (remotesRaw?.trim().length ?? 0) > 0,
        };
    }

    async pull(): Promise<boolean> {
        const ok = await this.isAvailable();
        if (!ok) return false;

        const status = await this.getStatus();
        if (!status) return false;
        if (!status.hasRemotes) {
            new Notice('No git remote configured');
            return false;
        }
        if (status.dirty > 0) {
            new Notice(`Cannot pull: ${status.dirty} uncommitted change(s). Commit or stash first.`);
            return false;
        }

        try {
            const result = await this.run('git pull --ff-only');
            if (result !== null) {
                new Notice('Pulled latest from remote');
                return true;
            }
            return false;
        } catch {
            new Notice('Git pull failed');
            return false;
        }
    }

    async commitAndPush(message: string): Promise<boolean> {
        const ok = await this.isAvailable();
        if (!ok) return false;

        const status = await this.getStatus();
        if (!status) return false;

        if (status.dirty === 0 && status.staged === 0) {
            if (status.ahead === 0) {
                new Notice('Nothing to push');
                return false;
            }
            const pushed = await this.run(`git push`);
            if (pushed !== null) {
                new Notice('Pushed to remote');
                return true;
            }
            new Notice('Git push failed');
            return false;
        }

        const addResult = await this.run(`git add -A`);
        if (addResult === null) {
            new Notice('Failed to stage files');
            return false;
        }

        const commitResult = await this.run(`git commit -m "${message.replace(/"/g, '\\"')}"`);
        if (commitResult === null) {
            new Notice('Failed to commit');
            return false;
        }

        const pushResult = await this.run('git push');
        if (pushResult !== null) {
            new Notice('Committed and pushed to remote');
            return true;
        }

        new Notice('Commit succeeded but push failed. Push manually.');
        return false;
    }

    private async run(command: string): Promise<string | null> {
        return new Promise((resolve) => {
            const proc = exec(command, { cwd: this.repoPath, timeout: 30000 }, (error, stdout) => {
                if (error) {
                    resolve(null);
                } else {
                    resolve(stdout);
                }
            });
            proc.on('error', () => resolve(null));
        });
    }
}
