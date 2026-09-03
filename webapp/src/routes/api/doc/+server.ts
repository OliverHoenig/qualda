import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { saveDoc, HttpError } from '$lib/server/library';
import type { Doc } from '$lib/types';

// PUT /api/doc  { path, title?, body, annotations }
// Serializes annotations into the file's frontmatter and writes it to disk.
export const PUT: RequestHandler = async ({ request }) => {
	let doc: Doc;
	try {
		doc = (await request.json()) as Doc;
	} catch {
		throw error(400, 'Ungültiger Request-Body.');
	}
	if (!doc || typeof doc.path !== 'string' || typeof doc.body !== 'string') {
		throw error(400, 'Fehlende Felder (path, body).');
	}
	try {
		await saveDoc({
			path: doc.path,
			name: doc.name ?? '',
			title: doc.title,
			body: doc.body,
			annotations: Array.isArray(doc.annotations) ? doc.annotations : []
		});
		return json({ ok: true });
	} catch (e) {
		if (e instanceof HttpError) throw error(e.status, e.message);
		throw error(500, e instanceof Error ? e.message : 'Unbekannter Fehler');
	}
};
