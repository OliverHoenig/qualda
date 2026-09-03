import type { Annotation } from '$lib/types';

/**
 * Adjust annotation offsets after the body text changed, so highlights keep
 * pointing at the right passages (User Story 11).
 *
 * We compute a single changed region via common prefix/suffix between the old
 * and new body, then shift/clamp each annotation boundary accordingly and
 * refresh its stored quote from the new text.
 */
export function adjustAnnotations(
	oldBody: string,
	newBody: string,
	annotations: Annotation[]
): Annotation[] {
	if (oldBody === newBody) return annotations;

	// Length of the common prefix.
	let prefix = 0;
	const maxPrefix = Math.min(oldBody.length, newBody.length);
	while (prefix < maxPrefix && oldBody[prefix] === newBody[prefix]) prefix++;

	// Length of the common suffix (not overlapping the prefix).
	let suffix = 0;
	const maxSuffix = Math.min(oldBody.length, newBody.length) - prefix;
	while (
		suffix < maxSuffix &&
		oldBody[oldBody.length - 1 - suffix] === newBody[newBody.length - 1 - suffix]
	) {
		suffix++;
	}

	const oldChangeStart = prefix;
	const oldChangeEnd = oldBody.length - suffix; // exclusive
	const newChangeEnd = newBody.length - suffix; // exclusive
	const delta = newBody.length - oldBody.length;

	const mapOffset = (offset: number): number => {
		if (offset <= oldChangeStart) return offset; // before the edit
		if (offset >= oldChangeEnd) return offset + delta; // after the edit
		// Inside the edited region: clamp to the new region end.
		return Math.min(offset, newChangeEnd);
	};

	return (
		annotations
			.map((a) => {
				const start = mapOffset(a.start);
				const end = mapOffset(a.end);
				const clampedStart = Math.max(0, Math.min(start, newBody.length));
				const clampedEnd = Math.max(0, Math.min(end, newBody.length));
				return {
					...a,
					start: clampedStart,
					end: clampedEnd,
					quote: newBody.slice(clampedStart, clampedEnd)
				};
			})
			// Drop annotations whose passage was fully deleted.
			.filter((a) => a.end > a.start)
	);
}
