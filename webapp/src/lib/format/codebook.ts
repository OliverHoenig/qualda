import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { Codebook, CodeNode, FlatCode } from '$lib/types';

/** Fallback palette used when a top-level code has no explicit color. */
const DEFAULT_PALETTE = [
	'#e11d48', // rose
	'#2563eb', // blue
	'#16a34a', // green
	'#d97706', // amber
	'#7c3aed', // violet
	'#0891b2', // cyan
	'#db2777', // pink
	'#65a30d', // lime
	'#dc2626', // red
	'#0d9488' // teal
];

export const EMPTY_CODEBOOK: Codebook = { codes: [] };

/** Parse the contents of a `codebook.yaml` file. Tolerant of empty/missing. */
export function parseCodebook(raw: string): Codebook {
	if (!raw || !raw.trim()) return { codes: [] };
	let data: unknown;
	try {
		data = parseYaml(raw);
	} catch {
		return { codes: [] };
	}
	if (!data || typeof data !== 'object') return { codes: [] };
	const codes = (data as { codes?: unknown }).codes;
	if (!Array.isArray(codes)) return { codes: [] };
	return { codes: codes.map(normalizeNode).filter((n): n is CodeNode => n !== null) };
}

function normalizeNode(input: unknown): CodeNode | null {
	if (!input || typeof input !== 'object') return null;
	const obj = input as Record<string, unknown>;
	const id = typeof obj.id === 'string' ? obj.id : undefined;
	if (!id) return null;
	const node: CodeNode = {
		id,
		label: typeof obj.label === 'string' && obj.label ? obj.label : id
	};
	if (typeof obj.color === 'string') node.color = obj.color;
	if (typeof obj.description === 'string') node.description = obj.description;
	if (Array.isArray(obj.children)) {
		const children = obj.children.map(normalizeNode).filter((n): n is CodeNode => n !== null);
		if (children.length) node.children = children;
	}
	return node;
}

/** Serialize a codebook back to YAML for `codebook.yaml`. */
export function serializeCodebook(codebook: Codebook): string {
	const header =
		'# Qualda codebook - the predefined set of codes.\n' +
		'# Only codes listed here can be assigned to passages.\n' +
		'# `children` are subcodes. `color` is optional (inherited from parent).\n\n';
	return header + stringifyYaml({ codes: codebook.codes }, { lineWidth: 0 });
}

/**
 * Flatten the codebook tree into an ordered list with resolved colors and
 * full paths. Colors cascade: a subcode without a color inherits its parent's.
 */
export function flattenCodes(codebook: Codebook): FlatCode[] {
	const out: FlatCode[] = [];
	const walk = (
		nodes: CodeNode[],
		prefix: string,
		labelPrefix: string,
		depth: number,
		inheritedColor: string
	) => {
		nodes.forEach((node, index) => {
			const path = prefix ? `${prefix}/${node.id}` : node.id;
			const labelPath = labelPrefix ? `${labelPrefix} / ${node.label}` : node.label;
			const color =
				node.color ??
				(depth === 0 ? DEFAULT_PALETTE[index % DEFAULT_PALETTE.length] : inheritedColor);
			out.push({
				path,
				labelPath,
				label: node.label,
				color,
				depth,
				description: node.description
			});
			if (node.children?.length) {
				walk(node.children, path, labelPath, depth + 1, color);
			}
		});
	};
	walk(codebook.codes, '', '', 0, DEFAULT_PALETTE[0]);
	return out;
}

/** Build a fast lookup map from code path -> FlatCode. */
export function buildCodeIndex(codebook: Codebook): Map<string, FlatCode> {
	const map = new Map<string, FlatCode>();
	for (const c of flattenCodes(codebook)) map.set(c.path, c);
	return map;
}

/** Resolve a code path to its flattened entry (or undefined if unknown). */
export function findCode(codebook: Codebook, path: string): FlatCode | undefined {
	return buildCodeIndex(codebook).get(path);
}

/** A path is valid only if it maps to an existing code in the codebook. */
export function isKnownCode(codebook: Codebook, path: string): boolean {
	return buildCodeIndex(codebook).has(path);
}

/** Suggest the next color from the palette for a new top-level code. */
export function nextPaletteColor(existingCount: number): string {
	return DEFAULT_PALETTE[existingCount % DEFAULT_PALETTE.length];
}

// --- Tree editing (pure functions returning a new codebook) ----------------

/** Turn a label into a URL/path-safe slug id. */
export function slugify(label: string): string {
	return (
		label
			.toLowerCase()
			.trim()
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'code'
	);
}

function cloneCodes(nodes: CodeNode[]): CodeNode[] {
	return nodes.map((n) => ({
		...n,
		children: n.children ? cloneCodes(n.children) : undefined
	}));
}

/** Ensure `id` is unique among siblings by appending a numeric suffix. */
function uniqueId(base: string, siblings: CodeNode[]): string {
	const existing = new Set(siblings.map((s) => s.id));
	if (!existing.has(base)) return base;
	let i = 2;
	while (existing.has(`${base}-${i}`)) i++;
	return `${base}-${i}`;
}

/** Locate the array of siblings that a given path lives in, plus the node. */
function findParentList(
	codebook: Codebook,
	path: string
): { list: CodeNode[]; node: CodeNode } | null {
	const parts = path.split('/');
	let list = codebook.codes;
	let node: CodeNode | undefined;
	for (let i = 0; i < parts.length; i++) {
		node = list.find((n) => n.id === parts[i]);
		if (!node) return null;
		if (i < parts.length - 1) {
			node.children = node.children ?? [];
			list = node.children;
		}
	}
	return node ? { list, node } : null;
}

/** Add a new top-level code, returning the new codebook. */
export function addCode(codebook: Codebook, label: string, color?: string): Codebook {
	const codes = cloneCodes(codebook.codes);
	const id = uniqueId(slugify(label), codes);
	codes.push({ id, label: label.trim() || id, color: color ?? nextPaletteColor(codes.length) });
	return { codes };
}

/** Add a subcode under the code at `parentPath`, returning the new codebook. */
export function addSubcode(codebook: Codebook, parentPath: string, label: string): Codebook {
	const next: Codebook = { codes: cloneCodes(codebook.codes) };
	const found = findParentList(next, parentPath);
	if (!found) return codebook;
	found.node.children = found.node.children ?? [];
	const id = uniqueId(slugify(label), found.node.children);
	found.node.children.push({ id, label: label.trim() || id });
	return next;
}

/** Update label/color/description of the code at `path`. */
export function updateCode(
	codebook: Codebook,
	path: string,
	patch: Partial<Pick<CodeNode, 'label' | 'color' | 'description'>>
): Codebook {
	const next: Codebook = { codes: cloneCodes(codebook.codes) };
	const found = findParentList(next, path);
	if (!found) return codebook;
	if (patch.label !== undefined) found.node.label = patch.label;
	if (patch.color !== undefined) found.node.color = patch.color || undefined;
	if (patch.description !== undefined) found.node.description = patch.description || undefined;
	return next;
}

/** Remove the code at `path` (and its subcodes), returning the new codebook. */
export function removeCode(codebook: Codebook, path: string): Codebook {
	const next: Codebook = { codes: cloneCodes(codebook.codes) };
	const found = findParentList(next, path);
	if (!found) return codebook;
	const idx = found.list.indexOf(found.node);
	if (idx !== -1) found.list.splice(idx, 1);
	return next;
}
