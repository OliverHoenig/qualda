import type { Annotation, Codebook, Doc, FlatCode } from '$lib/types';
import {
	addCode,
	addSubcode,
	buildCodeIndex,
	flattenCodes,
	removeCode,
	updateCode
} from '$lib/format/codebook';
import type { CodeNode } from '$lib/types';
import { adjustAnnotations } from '$lib/format/offsets';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type View = 'annotate' | 'cluster';

const STORAGE_KEY = 'qualda:lastFolder';

function newId(): string {
	return `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Central client-side application state (Svelte 5 runes). */
class AppState {
	folder = $state('');
	folderInput = $state('');
	loading = $state(false);
	errorMsg = $state('');

	codebook = $state<Codebook>({ codes: [] });
	docs = $state<Doc[]>([]);
	activeIndex = $state(-1);

	view = $state<View>('annotate');
	/** Text edit mode vs. read/annotate mode for the active document. */
	editingText = $state(false);
	/**
	 * In-progress edit buffer. While editing, keystrokes only update this draft
	 * (no re-anchoring, no file writes) so typing stays fluid. Changes are
	 * applied to the document and written to disk on demand via `commitDraft()`.
	 * `null` means "not currently editing / no pending draft".
	 */
	draft = $state<string | null>(null);
	/** The code currently selected for assigning to a new passage. */
	activeCodePath = $state<string | null>(null);
	/** Code path used to filter the cluster view (null = show all). */
	clusterCodePath = $state<string | null>(null);
	/** Currently focused annotation (for the inspector / editing). */
	selectedAnnotationId = $state<string | null>(null);
	/** Annotation whose text range is being redefined via a new selection. */
	rerangeAnnotationId = $state<string | null>(null);

	saveStatus = $state<SaveStatus>('idle');
	codebookStatus = $state<SaveStatus>('idle');

	#docSaveTimer: ReturnType<typeof setTimeout> | null = null;
	#codebookSaveTimer: ReturnType<typeof setTimeout> | null = null;

	readonly flatCodes: FlatCode[] = $derived(flattenCodes(this.codebook));
	readonly codeIndex: Map<string, FlatCode> = $derived(buildCodeIndex(this.codebook));

	get activeDoc(): Doc | null {
		return this.activeIndex >= 0 && this.activeIndex < this.docs.length
			? this.docs[this.activeIndex]
			: null;
	}

	/** True when the edit buffer differs from the saved document body. */
	get isDirty(): boolean {
		return this.draft !== null && !!this.activeDoc && this.draft !== this.activeDoc.body;
	}

	/** Restore the last opened folder from localStorage (call on mount). */
	init() {
		if (typeof localStorage === 'undefined') return;
		const last = localStorage.getItem(STORAGE_KEY);
		if (last) {
			this.folderInput = last;
			void this.loadFolder(last);
		}
	}

	async loadFolder(path: string) {
		const folder = path.trim();
		if (!folder) return;
		this.loading = true;
		this.errorMsg = '';
		try {
			const res = await fetch(`/api/folder?path=${encodeURIComponent(folder)}`);
			if (!res.ok) {
				const msg = await res.text();
				throw new Error(msg || `Fehler ${res.status}`);
			}
			const data = (await res.json()) as {
				folder: string;
				codebook: Codebook;
				docs: Doc[];
			};
			this.folder = data.folder;
			this.codebook = data.codebook ?? { codes: [] };
			this.docs = data.docs ?? [];
			this.activeIndex = this.docs.length > 0 ? 0 : -1;
			this.selectedAnnotationId = null;
			this.rerangeAnnotationId = null;
			if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, data.folder);
		} catch (e) {
			this.errorMsg = e instanceof Error ? e.message : 'Unbekannter Fehler';
			this.docs = [];
			this.activeIndex = -1;
		} finally {
			this.loading = false;
		}
	}

	openDoc(index: number) {
		if (index < 0 || index >= this.docs.length) return;
		if (index === this.activeIndex) return;
		// Persist any pending edits before leaving the current document.
		if (this.isDirty) this.commitDraft();
		this.activeIndex = index;
		this.selectedAnnotationId = null;
		this.rerangeAnnotationId = null;
		this.editingText = false;
		this.draft = null;
		this.view = 'annotate';
	}

	// --- Text editing ------------------------------------------------------

	/** Enter text-edit mode, seeding the draft from the current body. */
	startEditing() {
		if (!this.activeDoc) return;
		this.draft = this.activeDoc.body;
		this.editingText = true;
	}

	/** Update the local edit buffer. Does NOT touch annotations or the file. */
	updateDraft(text: string) {
		this.draft = text;
	}

	/**
	 * Apply the buffered edits: re-anchor all annotations against the new text
	 * (handling changes at several places at once) and write the file once.
	 */
	commitDraft() {
		const doc = this.activeDoc;
		if (!doc || this.draft === null) return;
		if (this.draft !== doc.body) {
			doc.annotations = adjustAnnotations(doc.body, this.draft, [...doc.annotations]);
			doc.body = this.draft;
			void this.saveActiveDoc();
		}
		// Draft now matches the saved body -> clean, but stay in edit mode.
		this.draft = doc.body;
	}

	/** Throw away buffered edits and leave text-edit mode. */
	discardDraft() {
		this.draft = null;
		this.editingText = false;
	}

	/** Leave edit mode, committing any pending changes first. */
	stopEditing() {
		if (this.isDirty) this.commitDraft();
		this.draft = null;
		this.editingText = false;
	}

	// --- Annotations -------------------------------------------------------

	addAnnotation(codePath: string, start: number, end: number) {
		const doc = this.activeDoc;
		if (!doc || end <= start) return;
		if (!this.codeIndex.has(codePath)) return; // only predefined codes
		const annotation: Annotation = {
			id: newId(),
			code: codePath,
			start,
			end,
			quote: doc.body.slice(start, end)
		};
		doc.annotations.push(annotation);
		this.selectedAnnotationId = annotation.id;
		this.scheduleDocSave();
	}

	updateAnnotationCode(id: string, codePath: string) {
		const doc = this.activeDoc;
		if (!doc || !this.codeIndex.has(codePath)) return;
		const a = doc.annotations.find((x) => x.id === id);
		if (a) {
			a.code = codePath;
			this.scheduleDocSave();
		}
	}

	/** Redefine the start/end of an annotation, keeping the quote in sync. */
	updateAnnotationRange(id: string, start: number, end: number) {
		const doc = this.activeDoc;
		if (!doc || end <= start) return;
		const clampedStart = Math.max(0, Math.min(start, doc.body.length));
		const clampedEnd = Math.max(0, Math.min(end, doc.body.length));
		if (clampedEnd <= clampedStart) return;
		const a = doc.annotations.find((x) => x.id === id);
		if (a) {
			a.start = clampedStart;
			a.end = clampedEnd;
			a.quote = doc.body.slice(clampedStart, clampedEnd);
			this.scheduleDocSave();
		}
	}

	deleteAnnotation(id: string) {
		const doc = this.activeDoc;
		if (!doc) return;
		const idx = doc.annotations.findIndex((x) => x.id === id);
		if (idx !== -1) {
			doc.annotations.splice(idx, 1);
			if (this.selectedAnnotationId === id) this.selectedAnnotationId = null;
			if (this.rerangeAnnotationId === id) this.rerangeAnnotationId = null;
			this.scheduleDocSave();
		}
	}

	// --- Persistence -------------------------------------------------------

	scheduleDocSave() {
		this.saveStatus = 'saving';
		if (this.#docSaveTimer) clearTimeout(this.#docSaveTimer);
		this.#docSaveTimer = setTimeout(() => void this.saveActiveDoc(), 600);
	}

	async saveActiveDoc() {
		const doc = this.activeDoc;
		if (!doc) return;
		this.saveStatus = 'saving';
		try {
			const res = await fetch('/api/doc', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					path: doc.path,
					name: doc.name,
					title: doc.title,
					body: doc.body,
					annotations: doc.annotations
				})
			});
			if (!res.ok) throw new Error(await res.text());
			this.saveStatus = 'saved';
		} catch (e) {
			this.saveStatus = 'error';
			this.errorMsg = e instanceof Error ? e.message : 'Speichern fehlgeschlagen';
		}
	}

	// --- Codebook editing --------------------------------------------------

	addTopCode(label: string) {
		if (!label.trim()) return;
		this.codebook = addCode(this.codebook, label);
		this.scheduleCodebookSave();
	}

	addChildCode(parentPath: string, label: string) {
		if (!label.trim()) return;
		this.codebook = addSubcode(this.codebook, parentPath, label);
		this.scheduleCodebookSave();
	}

	editCode(path: string, patch: Partial<Pick<CodeNode, 'label' | 'color' | 'description'>>) {
		this.codebook = updateCode(this.codebook, path, patch);
		this.scheduleCodebookSave();
	}

	removeCodePath(path: string) {
		this.codebook = removeCode(this.codebook, path);
		this.scheduleCodebookSave();
	}

	scheduleCodebookSave() {
		this.codebookStatus = 'saving';
		if (this.#codebookSaveTimer) clearTimeout(this.#codebookSaveTimer);
		this.#codebookSaveTimer = setTimeout(() => void this.saveCodebook(), 500);
	}

	async saveCodebook() {
		if (!this.folder) return;
		try {
			const res = await fetch('/api/codebook', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ path: this.folder, codebook: this.codebook })
			});
			if (!res.ok) throw new Error(await res.text());
			this.codebookStatus = 'saved';
		} catch (e) {
			this.codebookStatus = 'error';
			this.errorMsg = e instanceof Error ? e.message : 'Codebuch-Speichern fehlgeschlagen';
		}
	}

	/** Count annotations for a given code path across all documents. */
	countForCode(codePath: string): number {
		let n = 0;
		for (const doc of this.docs) {
			for (const a of doc.annotations) if (a.code === codePath) n++;
		}
		return n;
	}
}

export const app = new AppState();
