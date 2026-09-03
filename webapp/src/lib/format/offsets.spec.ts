import { describe, it, expect } from 'vitest';
import { adjustAnnotations } from './offsets';
import type { Annotation } from '$lib/types';

// Robustness of live re-anchoring while the transcript body is edited:
// annotations must follow the text through char-count changes, inserted line
// breaks and multi-character edits, and never silently swallow inserted text.
describe('adjustAnnotations robustness', () => {
	const body = 'Am Anfang lief alles gut. Dann war ich wütend.';
	const anns = (): Annotation[] => [
		{ id: 'a', code: 'joy', start: 0, end: 25, quote: 'Am Anfang lief alles gut.' },
		{ id: 'b', code: 'anger', start: 39, end: 46, quote: 'wütend.' }
	];

	it('text inserted at offset 0 does not get swallowed by a start-anchored span', () => {
		const nb = 'Hallo. ' + body;
		const r = adjustAnnotations(body, nb, anns());
		expect(nb.slice(r[0].start, r[0].end)).toBe('Am Anfang lief alles gut.');
		expect(nb.slice(r[1].start, r[1].end)).toBe('wütend.');
	});

	it('a line break inserted between two spans shifts the later one', () => {
		const nb = body.slice(0, 25) + '\n\n' + body.slice(25);
		const r = adjustAnnotations(body, nb, anns());
		expect(nb.slice(r[0].start, r[0].end)).toBe('Am Anfang lief alles gut.');
		expect(nb.slice(r[1].start, r[1].end)).toBe('wütend.');
	});

	it('text typed strictly inside a span grows it and keeps quote in sync', () => {
		// insert "wirklich " inside span b, between "wüt" and "end"
		const nb = body.replace('wütend.', 'wütend wirklich.');
		const r = adjustAnnotations(body, nb, anns());
		expect(r[1].quote).toBe(nb.slice(r[1].start, r[1].end));
		expect(r[1].quote).toBe('wütend wirklich.');
	});

	it('text typed at the exact end of a span does not extend it', () => {
		// append "!!!" right after "gut." (end of span a)
		const nb = body.slice(0, 25) + '!!!' + body.slice(25);
		const r = adjustAnnotations(body, nb, anns());
		expect(nb.slice(r[0].start, r[0].end)).toBe('Am Anfang lief alles gut.');
	});

	it('a length-changing word edit inside a span keeps the tail span correct', () => {
		const nb = body.replace('Anfang', 'Start'); // shorter, inside span a
		const r = adjustAnnotations(body, nb, anns());
		expect(nb.slice(r[1].start, r[1].end)).toBe('wütend.');
		expect(r[0].quote).toBe(nb.slice(r[0].start, r[0].end));
	});

	it('detects SEVERAL edits at different places in one step (batched save)', () => {
		// Two independent, length-changing edits far apart, both outside the
		// spans: "Anfang" -> "Beginn" (before span a's text stays), and a big
		// insertion between the two sentences. Both spans must stay correct.
		const nb = 'Am Beginn lief wirklich alles gut. Dann, ganz plötzlich, war ich wütend.';
		const r = adjustAnnotations(body, nb, anns());
		expect(nb.slice(r[1].start, r[1].end)).toBe('wütend.');
		// span a should still cover its (now edited) first sentence, quote synced
		expect(r[0].quote).toBe(nb.slice(r[0].start, r[0].end));
		expect(r[0].quote.startsWith('Am Beginn')).toBe(true);
		expect(r[0].quote.endsWith('gut.')).toBe(true);
	});
});
