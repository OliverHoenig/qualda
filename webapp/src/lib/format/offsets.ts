import type { Annotation } from '$lib/types';

/**
 * A block of text that is identical in the old and new body. These matching
 * blocks are the anchors we use to translate old character offsets into new
 * ones, so annotations follow the text they cover.
 */
interface MatchBlock {
	oldStart: number;
	newStart: number;
	size: number;
}

/**
 * Adjust annotation offsets after the body text changed, so highlights keep
 * pointing at the right passages (User Story 11).
 *
 * Unlike a naive single-region diff, this detects *all* changed regions (edits
 * at several different places at once — e.g. after a longer editing session that
 * is only saved on demand). We compute the matching blocks between old and new
 * text and translate each annotation boundary through them.
 *
 * Boundaries are mapped with a "gravity" so edits that land exactly on a
 * boundary behave intuitively and never silently swallow text:
 *  - a passage `start` has forward gravity: text inserted at the start is
 *    pushed *outside* the passage (start moves right),
 *  - a passage `end` has backward gravity: text inserted at the end stays
 *    *outside* the passage (end stays put).
 * Text inserted strictly inside a passage grows it; text typed at either edge
 * does not extend it. This holds for inserts, deletes and replacements,
 * regardless of how many characters change or how many line breaks appear.
 */
export function adjustAnnotations(
	oldBody: string,
	newBody: string,
	annotations: Annotation[]
): Annotation[] {
	if (oldBody === newBody) return annotations;

	const anchors = matchingBlocks(oldBody, newBody);

	/** Translate one old offset to a new offset using the matching blocks. */
	const mapOffset = (offset: number, gravity: 'forward' | 'backward'): number => {
		if (gravity === 'forward') {
			// First block that still contains or lies after `offset`.
			for (const b of anchors) {
				if (offset < b.oldStart) return b.newStart; // offset fell into a gap
				if (offset < b.oldStart + b.size) return b.newStart + (offset - b.oldStart);
			}
			return newBody.length;
		}
		// backward: last block that contains or lies before `offset`.
		for (let i = anchors.length - 1; i >= 0; i--) {
			const b = anchors[i];
			if (offset > b.oldStart + b.size) return b.newStart + b.size; // gap after block
			if (offset > b.oldStart) return b.newStart + (offset - b.oldStart);
		}
		return 0;
	};

	return (
		annotations
			.map((a) => {
				const start = clamp(mapOffset(a.start, 'forward'), newBody.length);
				const end = clamp(mapOffset(a.end, 'backward'), newBody.length);
				return { ...a, start, end, quote: newBody.slice(start, end) };
			})
			// Drop annotations whose passage was fully deleted or collapsed.
			.filter((a) => a.end > a.start)
	);
}

function clamp(n: number, max: number): number {
	return Math.max(0, Math.min(n, max));
}

/**
 * Compute the matching (identical) blocks between two strings, ordered by
 * position. Uses a difflib-style recursive "longest matching block" search,
 * which handles several independent edits well and keeps memory linear in the
 * input size. Common prefix/suffix are trimmed first to keep it fast for the
 * typical case of a few small edits in a large document.
 */
function matchingBlocks(a: string, b: string): MatchBlock[] {
	// Trim the shared prefix/suffix so we only diff the churned middle.
	let prefix = 0;
	const maxPrefix = Math.min(a.length, b.length);
	while (prefix < maxPrefix && a[prefix] === b[prefix]) prefix++;

	let suffix = 0;
	const maxSuffix = Math.min(a.length, b.length) - prefix;
	while (suffix < maxSuffix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;

	const blocks: MatchBlock[] = [];
	if (prefix > 0) blocks.push({ oldStart: 0, newStart: 0, size: prefix });

	const aMidLo = prefix;
	const aMidHi = a.length - suffix;
	const bMidLo = prefix;
	const bMidHi = b.length - suffix;

	if (aMidLo < aMidHi && bMidLo < bMidHi) {
		// Guard against pathological inputs: fall back to treating the whole
		// middle as a single replacement (no interior anchors).
		if ((aMidHi - aMidLo) * (bMidHi - bMidLo) <= 20_000_000) {
			const b2j = buildIndex(b, bMidLo, bMidHi);
			collectMatches(a, b, aMidLo, aMidHi, bMidLo, bMidHi, b2j, blocks);
		}
	}

	if (suffix > 0)
		blocks.push({ oldStart: a.length - suffix, newStart: b.length - suffix, size: suffix });

	blocks.sort((x, y) => x.oldStart - y.oldStart);
	return blocks;
}

/** Map each character in b[lo,hi) to the list of indices where it occurs. */
function buildIndex(b: string, lo: number, hi: number): Map<string, number[]> {
	const b2j = new Map<string, number[]>();
	for (let j = lo; j < hi; j++) {
		const c = b[j];
		const arr = b2j.get(c);
		if (arr) arr.push(j);
		else b2j.set(c, [j]);
	}
	return b2j;
}

/** Recursively find matching blocks in the given windows and push them. */
function collectMatches(
	a: string,
	b: string,
	alo: number,
	ahi: number,
	blo: number,
	bhi: number,
	b2j: Map<string, number[]>,
	out: MatchBlock[]
): void {
	const m = longestMatch(a, b, alo, ahi, blo, bhi, b2j);
	if (m.size === 0) return;
	if (alo < m.oldStart && blo < m.newStart) {
		collectMatches(a, b, alo, m.oldStart, blo, m.newStart, b2j, out);
	}
	out.push(m);
	if (m.oldStart + m.size < ahi && m.newStart + m.size < bhi) {
		collectMatches(a, b, m.oldStart + m.size, ahi, m.newStart + m.size, bhi, b2j, out);
	}
}

/** Longest common contiguous block within a[alo,ahi) and b[blo,bhi). */
function longestMatch(
	a: string,
	b: string,
	alo: number,
	ahi: number,
	blo: number,
	bhi: number,
	b2j: Map<string, number[]>
): MatchBlock {
	let besti = alo;
	let bestj = blo;
	let bestsize = 0;
	let j2len = new Map<number, number>();

	for (let i = alo; i < ahi; i++) {
		const newj2len = new Map<number, number>();
		const js = b2j.get(a[i]);
		if (js) {
			for (const j of js) {
				if (j < blo) continue;
				if (j >= bhi) break;
				const k = (j2len.get(j - 1) ?? 0) + 1;
				newj2len.set(j, k);
				if (k > bestsize) {
					besti = i - k + 1;
					bestj = j - k + 1;
					bestsize = k;
				}
			}
		}
		j2len = newj2len;
	}
	return { oldStart: besti, newStart: bestj, size: bestsize };
}
