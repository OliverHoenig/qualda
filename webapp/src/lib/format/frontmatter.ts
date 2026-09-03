import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { Annotation, Doc } from '$lib/types';
import { basename } from '$lib/format/path';

interface RawFrontmatter {
	title?: unknown;
	annotations?: unknown;
}

const DELIM = '---';

/** Split a file's raw contents into (frontmatterYaml, body). */
function splitFrontmatter(raw: string): { fm: string | null; body: string } {
	// Tolerate a leading BOM.
	const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
	// Must start with the delimiter line.
	if (!/^---[ \t]*\r?\n/.test(text)) return { fm: null, body: text };
	const rest = text.slice(text.indexOf('\n') + 1);
	// Find the closing delimiter line.
	const closing = rest.match(/(^|\r?\n)---[ \t]*(\r?\n|$)/);
	if (!closing || closing.index === undefined) return { fm: null, body: text };
	const fm = rest.slice(0, closing.index + (closing[1] ? closing[1].length : 0));
	const afterDelim = closing.index + closing[0].length;
	// Drop the single blank line that conventionally separates the frontmatter
	// from the body, so offsets line up with the transcript a human sees.
	const body = rest.slice(afterDelim).replace(/^\r?\n/, '');
	return { fm: fm.replace(/\r?\n$/, ''), body };
}

/** Coerce arbitrary parsed YAML into a normalized Annotation. */
function normalizeAnnotation(input: unknown, idx: number): Annotation | null {
	if (!input || typeof input !== 'object') return null;
	const obj = input as Record<string, unknown>;
	const code = typeof obj.code === 'string' ? obj.code : undefined;
	if (!code) return null;
	const start = Number(obj.start);
	const end = Number(obj.end);
	if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
	const id = typeof obj.id === 'string' && obj.id ? obj.id : `a${idx + 1}`;
	const quote = typeof obj.quote === 'string' ? obj.quote : '';
	return {
		id,
		code,
		start: Math.max(0, Math.trunc(start)),
		end: Math.max(0, Math.trunc(end)),
		quote
	};
}

/** Parse a transcript file into a Doc. `path` is the absolute file path. */
export function parseDoc(raw: string, path: string): Doc {
	const { fm, body } = splitFrontmatter(raw);
	let title: string | undefined;
	let annotations: Annotation[] = [];

	if (fm !== null && fm.trim()) {
		let data: RawFrontmatter | null = null;
		try {
			data = parseYaml(fm) as RawFrontmatter;
		} catch {
			data = null;
		}
		if (data && typeof data === 'object') {
			if (typeof data.title === 'string') title = data.title;
			if (Array.isArray(data.annotations)) {
				annotations = data.annotations
					.map((a, i) => normalizeAnnotation(a, i))
					.filter((a): a is Annotation => a !== null);
			}
		}
	}

	const doc: Doc = { path, name: basename(path), body, annotations };
	if (title) doc.title = title;
	return reconcileAnnotations(doc);
}

/**
 * Ensure annotation offsets still point at their stored quote. When a file was
 * hand-edited and offsets drifted, try to re-anchor via the quote text so the
 * highlight stays correct. Offsets are clamped to the body length.
 */
export function reconcileAnnotations(doc: Doc): Doc {
	const len = doc.body.length;
	doc.annotations = doc.annotations
		.map((a) => {
			let { start, end } = a;
			start = Math.min(Math.max(0, start), len);
			end = Math.min(Math.max(0, end), len);
			if (end < start) [start, end] = [end, start];

			const slice = doc.body.slice(start, end);
			if (a.quote && slice !== a.quote) {
				// Try to re-anchor: prefer an occurrence near the old start.
				const idx = findQuote(doc.body, a.quote, start);
				if (idx !== -1) {
					start = idx;
					end = idx + a.quote.length;
				}
			}
			const quote = a.quote || doc.body.slice(start, end);
			return { ...a, start, end, quote };
		})
		// Drop empty/degenerate spans.
		.filter((a) => a.end > a.start);
	return doc;
}

/** Find `quote` in `body`, preferring the occurrence closest to `near`. */
function findQuote(body: string, quote: string, near: number): number {
	if (!quote) return -1;
	let best = -1;
	let bestDist = Infinity;
	let from = 0;
	for (;;) {
		const idx = body.indexOf(quote, from);
		if (idx === -1) break;
		const dist = Math.abs(idx - near);
		if (dist < bestDist) {
			bestDist = dist;
			best = idx;
		}
		from = idx + 1;
	}
	return best;
}

/** Serialize a Doc back to file contents (frontmatter + body). */
export function serializeDoc(doc: Doc): string {
	const hasTitle = !!doc.title && doc.title.trim().length > 0;
	const hasAnnotations = doc.annotations.length > 0;

	// Keep raw transcripts clean: omit frontmatter entirely when there is
	// nothing to store.
	if (!hasTitle && !hasAnnotations) return doc.body;

	const fm: Record<string, unknown> = {};
	if (hasTitle) fm.title = doc.title;
	if (hasAnnotations) {
		fm.annotations = [...doc.annotations]
			.sort((a, b) => a.start - b.start || a.end - b.end)
			.map((a) => ({
				id: a.id,
				code: a.code,
				start: a.start,
				end: a.end,
				quote: a.quote
			}));
	}
	const yaml = stringifyYaml(fm, { lineWidth: 0 });
	return `${DELIM}\n${yaml}${DELIM}\n\n${doc.body}`;
}
