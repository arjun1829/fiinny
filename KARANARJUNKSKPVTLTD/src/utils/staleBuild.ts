// Recovery for "a deploy happened while this tab was open".
//
// Every deploy renames the lazy page chunks (LoginPage-<hash>.js …) and deletes
// the old ones. A tab still running the previous build then fails the moment it
// opens a page it has not loaded yet ("Failed to fetch dynamically imported
// module"). The right fix is simply loading the new build, so we reload once.
// A timestamp guard stops a reload loop if the chunk is genuinely broken.

const KEY = 'ka_stale_build_reload_at';
const WINDOW_MS = 30_000;

const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk [\w-]+ failed|ChunkLoadError|is not a valid JavaScript MIME type/i;

export function isStaleChunkError(err: unknown): boolean {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err ?? '');
    return CHUNK_ERROR.test(msg);
}

/** Reload once to pick up the new build. Returns false when we already tried recently. */
export function reloadForNewBuild(): boolean {
    try {
        const last = Number(sessionStorage.getItem(KEY) || 0);
        if (Date.now() - last < WINDOW_MS) return false;
        sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
        // Storage blocked (private mode etc.): still reload once; the browser's
        // own navigation will not loop because the next load is a fresh build.
    }
    window.location.reload();
    return true;
}

/** Vite fires this when a dynamic import or its CSS preload fails. */
export function installStaleBuildRecovery(): void {
    window.addEventListener('vite:preloadError', (event) => {
        if (reloadForNewBuild()) event.preventDefault();
    });
}
