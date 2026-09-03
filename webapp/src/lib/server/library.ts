import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, isAbsolute, basename } from 'node:path';
import { parseDoc, serializeDoc } from '$lib/format/frontmatter';
import { parseCodebook, serializeCodebook } from '$lib/format/codebook';
import type { Codebook, Doc } from '$lib/types';

export const CODEBOOK_FILENAME = 'codebook.yaml';

export interface Library {
	folder: string;
	codebook: Codebook;
	docs: Doc[];
}

/** Validate that `folder` is an existing absolute directory path. */
async function assertDirectory(folder: string): Promise<void> {
	if (!folder || !isAbsolute(folder)) {
		throw new HttpError(400, 'Bitte einen absoluten Ordnerpfad angeben.');
	}
	let info;
	try {
		info = await stat(folder);
	} catch {
		throw new HttpError(404, `Ordner nicht gefunden: ${folder}`);
	}
	if (!info.isDirectory()) {
		throw new HttpError(400, `Kein Ordner: ${folder}`);
	}
}

/** Load the whole library: codebook + all `.md` transcripts in the folder. */
export async function loadLibrary(folder: string): Promise<Library> {
	await assertDirectory(folder);

	const entries = await readdir(folder, { withFileTypes: true });
	const mdFiles = entries
		.filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md'))
		.map((e) => e.name)
		.sort((a, b) => a.localeCompare(b));

	const docs: Doc[] = [];
	for (const name of mdFiles) {
		const filePath = join(folder, name);
		const raw = await readFile(filePath, 'utf8');
		docs.push(parseDoc(raw, filePath));
	}

	const codebook = await loadCodebook(folder);
	return { folder, codebook, docs };
}

/** Read the shared codebook, returning an empty one when the file is absent. */
export async function loadCodebook(folder: string): Promise<Codebook> {
	const filePath = join(folder, CODEBOOK_FILENAME);
	try {
		const raw = await readFile(filePath, 'utf8');
		return parseCodebook(raw);
	} catch {
		return { codes: [] };
	}
}

/** Persist the shared codebook to `codebook.yaml`. */
export async function saveCodebook(folder: string, codebook: Codebook): Promise<void> {
	await assertDirectory(folder);
	const filePath = join(folder, CODEBOOK_FILENAME);
	await writeFile(filePath, serializeCodebook(codebook), 'utf8');
}

/** Persist a single transcript document (annotations in frontmatter). */
export async function saveDoc(doc: Doc): Promise<void> {
	if (!doc.path || !isAbsolute(doc.path)) {
		throw new HttpError(400, 'Ungültiger Dateipfad.');
	}
	if (!doc.path.toLowerCase().endsWith('.md')) {
		throw new HttpError(400, 'Nur .md-Dateien werden unterstützt.');
	}
	const normalized: Doc = {
		...doc,
		name: basename(doc.path)
	};
	await writeFile(doc.path, serializeDoc(normalized), 'utf8');
}

/** A small error type carrying an HTTP status for route handlers. */
export class HttpError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}
