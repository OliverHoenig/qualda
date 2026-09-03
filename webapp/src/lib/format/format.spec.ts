import { describe, it, expect } from 'vitest';
import { parseDoc, serializeDoc, reconcileAnnotations } from './frontmatter';
import { adjustAnnotations } from './offsets';
import { buildSegments } from './segments';
import {
	parseCodebook,
	serializeCodebook,
	flattenCodes,
	addCode,
	addSubcode,
	updateCode,
	removeCode,
	isKnownCode
} from './codebook';
import type { Annotation, Doc } from '$lib/types';

describe('frontmatter parse/serialize', () => {
	const raw = `---
title: Interview 01
annotations:
  - id: a1
    code: emotion/anger
    start: 6
    end: 11
    quote: "wütend"
---

Ich war wütend über die Sache.`;

	it('parses frontmatter, annotations and body', () => {
		const doc = parseDoc(raw, '/tmp/interview-01.md');
		expect(doc.title).toBe('Interview 01');
		expect(doc.name).toBe('interview-01.md');
		expect(doc.annotations).toHaveLength(1);
		expect(doc.annotations[0].code).toBe('emotion/anger');
		expect(doc.body.startsWith('Ich war')).toBe(true);
	});

	it('round-trips (parse -> serialize -> parse) preserving data', () => {
		const doc = parseDoc(raw, '/tmp/interview-01.md');
		const out = serializeDoc(doc);
		const again = parseDoc(out, '/tmp/interview-01.md');
		expect(again.title).toBe(doc.title);
		expect(again.body).toBe(doc.body);
		expect(again.annotations[0]).toMatchObject({
			code: 'emotion/anger',
			start: doc.annotations[0].start,
			end: doc.annotations[0].end
		});
	});

	it('keeps raw text clean when there are no annotations/title', () => {
		const doc: Doc = { path: '/tmp/x.md', name: 'x.md', body: 'Nur Text.', annotations: [] };
		expect(serializeDoc(doc)).toBe('Nur Text.');
	});

	it('treats a plain file with no frontmatter as body only', () => {
		const doc = parseDoc('Kein Frontmatter hier.', '/tmp/plain.md');
		expect(doc.annotations).toHaveLength(0);
		expect(doc.body).toBe('Kein Frontmatter hier.');
	});
});

describe('reconcileAnnotations re-anchors via quote', () => {
	it('fixes drifted offsets using the stored quote', () => {
		const body = 'Vorwort. Ich war wütend über die Sache.';
		const doc: Doc = {
			path: '/tmp/x.md',
			name: 'x.md',
			body,
			// Wrong offsets, but quote is present in the body.
			annotations: [{ id: 'a1', code: 'emotion/anger', start: 0, end: 5, quote: 'wütend' }]
		};
		const fixed = reconcileAnnotations(doc);
		expect(body.slice(fixed.annotations[0].start, fixed.annotations[0].end)).toBe('wütend');
	});
});

describe('adjustAnnotations (offset nachfuehrung)', () => {
	// In 'Hello, world!' the word "world" is at offsets 7..12.
	const base: Annotation[] = [{ id: 'a', code: 'c', start: 7, end: 12, quote: 'world' }];

	it('shifts offsets when text is inserted before the annotation', () => {
		const oldBody = 'Hello, world!';
		const newBody = 'Well... Hello, world!';
		const [a] = adjustAnnotations(oldBody, newBody, base);
		expect(newBody.slice(a.start, a.end)).toBe('world');
	});

	it('leaves offsets untouched when text changes after the annotation', () => {
		const oldBody = 'Hello, world!';
		const newBody = 'Hello, world! And more.';
		const [a] = adjustAnnotations(oldBody, newBody, base);
		expect(a.start).toBe(7);
		expect(a.end).toBe(12);
	});

	it('drops annotations whose passage is fully deleted', () => {
		const oldBody = 'Hello, world!';
		const newBody = 'Hello, !'; // "world" removed
		const result = adjustAnnotations(oldBody, newBody, base);
		expect(result).toHaveLength(0);
	});
});

describe('buildSegments handles overlaps', () => {
	it('creates a shared segment for overlapping annotations', () => {
		const body = 'abcdefghij';
		const anns: Annotation[] = [
			{ id: 'x', code: 'c1', start: 0, end: 6, quote: 'abcdef' },
			{ id: 'y', code: 'c2', start: 3, end: 10, quote: 'defghij' }
		];
		const segs = buildSegments(body, anns);
		// Boundaries at 0,3,6,10 -> three segments.
		expect(segs.map((s) => [s.start, s.end])).toEqual([
			[0, 3],
			[3, 6],
			[6, 10]
		]);
		// Middle segment is covered by both annotations.
		expect(segs[1].annotationIds.sort()).toEqual(['x', 'y']);
	});
});

describe('codebook', () => {
	it('parses, edits and serializes with subcodes', () => {
		let cb = parseCodebook('codes: []');
		cb = addCode(cb, 'Emotion');
		cb = addSubcode(cb, 'emotion', 'Wut');
		cb = updateCode(cb, 'emotion/wut', { color: '#123456', description: 'Ärger' });

		const flat = flattenCodes(cb);
		expect(flat.map((c) => c.path)).toEqual(['emotion', 'emotion/wut']);
		expect(isKnownCode(cb, 'emotion/wut')).toBe(true);
		expect(isKnownCode(cb, 'emotion/freude')).toBe(false);

		const yaml = serializeCodebook(cb);
		const reparsed = parseCodebook(yaml);
		expect(flattenCodes(reparsed).map((c) => c.path)).toEqual(['emotion', 'emotion/wut']);

		cb = removeCode(cb, 'emotion');
		expect(flattenCodes(cb)).toHaveLength(0);
	});

	it('inherits parent color for subcodes without their own color', () => {
		let cb = addCode({ codes: [] }, 'Thema', '#2563eb');
		cb = addSubcode(cb, 'thema', 'Vertrauen');
		const flat = flattenCodes(cb);
		expect(flat[1].color).toBe('#2563eb');
	});
});
