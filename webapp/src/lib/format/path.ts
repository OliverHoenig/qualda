// Tiny path helpers usable on both client and server (no node imports),
// so shared format modules stay isomorphic.

/** Return the final path segment (handles both `/` and `\` separators). */
export function basename(path: string): string {
	const normalized = path.replace(/[/\\]+$/, '');
	const idx = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
	return idx === -1 ? normalized : normalized.slice(idx + 1);
}

/** Join a directory and a file name with a forward slash. */
export function joinPath(dir: string, name: string): string {
	return `${dir.replace(/[/\\]+$/, '')}/${name}`;
}
