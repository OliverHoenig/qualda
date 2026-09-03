// Core domain types for the Qualda annotation tool.
// Everything is stored in human/AI-readable files (no database):
//  - Transcripts are `.md` files with YAML frontmatter (standoff annotations).
//  - The shared codebook lives in `codebook.yaml` in the same folder.

/** A code (or subcode) in the codebook. Subcodes are nested via `children`. */
export interface CodeNode {
	/** Slug, unique among its siblings (e.g. "anger"). */
	id: string;
	/** Human readable label (e.g. "Wut"). */
	label: string;
	/** Optional hex color. Subcodes inherit the parent color when omitted. */
	color?: string;
	/** Optional description of what the code means / coding rule. */
	description?: string;
	/** Nested subcodes. */
	children?: CodeNode[];
}

/** The predefined set of codes. Only codes defined here may be assigned. */
export interface Codebook {
	codes: CodeNode[];
}

/** A single annotation: a passage of the body text tagged with one code. */
export interface Annotation {
	/** Stable unique id within the document. */
	id: string;
	/** Code path, e.g. "emotion/anger" (parent/child = subcode). */
	code: string;
	/** Character offset into the body where the passage starts (inclusive). */
	start: number;
	/** Character offset into the body where the passage ends (exclusive). */
	end: number;
	/** Redundantly stored coded text, for human/AI readability + re-anchoring. */
	quote: string;
}

/** A parsed transcript document. */
export interface Doc {
	/** Absolute path of the `.md` file on disk. */
	path: string;
	/** File name (e.g. "interview-01.md"). */
	name: string;
	/** Optional title from frontmatter (falls back to file name in the UI). */
	title?: string;
	/** Raw transcript text (the markdown body, kept untouched). */
	body: string;
	/** Standoff annotations. */
	annotations: Annotation[];
}

/** Flattened view of a code, precomputed for lookup and rendering. */
export interface FlatCode {
	/** Full path, e.g. "emotion/anger". */
	path: string;
	/** Full label path, e.g. "Emotion / Wut". */
	labelPath: string;
	/** The code's own label. */
	label: string;
	/** Effective color (own color, or inherited from the nearest ancestor). */
	color: string;
	/** Nesting depth (0 = top level). */
	depth: number;
	description?: string;
}
