import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { saveCodebook, HttpError } from '$lib/server/library';
import type { Codebook } from '$lib/types';

// PUT /api/codebook  { path (folder), codebook }
// Persists the shared codebook to `codebook.yaml` in the folder.
export const PUT: RequestHandler = async ({ request }) => {
	let payload: { path?: string; codebook?: Codebook };
	try {
		payload = await request.json();
	} catch {
		throw error(400, 'Ungültiger Request-Body.');
	}
	const folder = payload.path ?? '';
	const codebook = payload.codebook;
	if (!folder || !codebook || !Array.isArray(codebook.codes)) {
		throw error(400, 'Fehlende Felder (path, codebook.codes).');
	}
	try {
		await saveCodebook(folder, codebook);
		return json({ ok: true });
	} catch (e) {
		if (e instanceof HttpError) throw error(e.status, e.message);
		throw error(500, e instanceof Error ? e.message : 'Unbekannter Fehler');
	}
};
