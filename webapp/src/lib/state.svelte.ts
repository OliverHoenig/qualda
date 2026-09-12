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
import { adjustAnnotations, projectAnnotations } from '$lib/format/offsets';

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
	/**
	 * In-progress edit buffer. Keystrokes only update this draft — stored
	 * annotation offsets stay on the last saved body until `commitDraft()`,
	 * so a discarded edit never shifts them. Highlights are projected onto
	 * the draft via `displayAnnotations`. `null` means the editor matches
	 * the saved body.
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

	/** Text currently shown in the editor (draft if present, otherwise saved body). */
	readonly displayBody: string = $derived(this.draft ?? this.activeDoc?.body ?? '');

	/**
	 * Annotations aligned to `displayBody`. Stored offsets are not mutated
	 * while the draft is dirty; they are only projected for display.
	 */
	readonly displayAnnotations: Annotation[] = $derived.by(() => {
		const doc = this.activeDoc;
		if (!doc) return [];
		return projectAnnotations(doc.body, this.displayBody, doc.annotations);
	});

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
			this.draft = null;
			this.selectedAnnotationId = null;
			this.rerangeAnnotationId = null;
			if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, data.folder);
		} catch (e) {
			this.errorMsg = e instanceof Error ? e.message : 'Unbekannter Fehler';
			this.docs = [];
			this.activeIndex = -1;
			this.draft = null;
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
		this.draft = null;
		this.view = 'annotate';
	}

	setView(view: View) {
		if (view === this.view) return;
		if (this.isDirty) this.commitDraft();
		this.view = view;
	}

	// --- Text editing ------------------------------------------------------

	/** Update the local edit buffer. Does NOT touch stored annotations or the file. */
	updateDraft(text: string) {
		if (this.draft === text) return;
		if (this.draft === null && this.activeDoc && text === this.activeDoc.body) return;
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
		this.draft = null;
	}

	/** Throw away buffered edits. Stored annotation offsets are unchanged. */
	discardDraft() {
		this.draft = null;
	}

	/**
	 * Persist pending text edits so annotation offsets can be written against
	 * the current editor text. Called automatically before add / re-range.
	 */
	ensureCommitted() {
		if (this.isDirty) this.commitDraft();
	}

	// --- Annotations -------------------------------------------------------

	addAnnotation(codePath: string, start: number, end: number) {
		this.ensureCommitted();
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
		this.ensureCommitted();
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
