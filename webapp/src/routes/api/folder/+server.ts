import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadLibrary, HttpError } from '$lib/server/library';

// GET /api/folder?path=/abs/path
// Loads the codebook + all `.md` transcripts (with annotations) in the folder.
export const GET: RequestHandler = async ({ url }) => {
	const folder = url.searchParams.get('path') ?? '';
	try {
		const library = await loadLibrary(folder);
		return json(library);
	} catch (e) {
		if (e instanceof HttpError) throw error(e.status, e.message);
		throw error(500, e instanceof Error ? e.message : 'Unbekannter Fehler');
	}
};
