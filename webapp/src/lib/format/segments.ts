import type { Annotation } from '$lib/types';

/** A contiguous slice of body text covered by zero or more annotations. */
export interface Segment {
	start: number;
	end: number;
	text: string;
	/** Ids of annotations covering this segment (may overlap/nest). */
	annotationIds: string[];
}

/**
 * Split the body into non-overlapping segments at every annotation boundary.
 * Overlapping and nested codes are represented by segments whose
 * `annotationIds` contains more than one id (User Story 5 & 6).
 */
export function buildSegments(body: string, annotations: Annotation[]): Segment[] {
	if (body.length === 0) return [];

	// Collect and sort unique boundary points within the body.
	const points = new Set<number>([0, body.length]);
	for (const a of annotations) {
		const s = clamp(a.start, body.length);
		const e = clamp(a.end, body.length);
		if (e > s) {
			points.add(s);
			points.add(e);
		}
	}
	const sorted = [...points].sort((x, y) => x - y);

	const segments: Segment[] = [];
	for (let i = 0; i < sorted.length - 1; i++) {
		const start = sorted[i];
		const end = sorted[i + 1];
		if (end <= start) continue;
		const ids = annotations
			.filter((a) => a.start <= start && a.end >= end && a.end > a.start)
			.map((a) => a.id);
		segments.push({ start, end, text: body.slice(start, end), annotationIds: ids });
	}
	return segments;
}

function clamp(n: number, max: number): number {
	return Math.max(0, Math.min(n, max));
}
