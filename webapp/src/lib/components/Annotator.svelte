<script lang="ts">
	import { app } from '$lib/state.svelte';
	import { buildSegments, type Segment } from '$lib/format/segments';
	import type { Annotation } from '$lib/types';

	let highlightsEl: HTMLDivElement | null = null;
	let textareaEl: HTMLTextAreaElement | null = null;

	// Floating code picker shown after a text selection.
	let menuOpen = $state(false);
	let menuX = $state(0);
	let menuY = $state(0);
	let query = $state('');
	let pending = $state<{ start: number; end: number } | null>(null);

	const segments = $derived(buildSegments(app.displayBody, app.displayAnnotations));

	const filteredCodes = $derived(
		app.flatCodes.filter(
			(c) =>
				!query.trim() ||
				c.labelPath.toLowerCase().includes(query.toLowerCase()) ||
				c.path.toLowerCase().includes(query.toLowerCase())
		)
	);

	function annotationsForSegment(seg: Segment): Annotation[] {
		return seg.annotationIds
			.map((id) => app.displayAnnotations.find((a) => a.id === id))
			.filter((a): a is Annotation => !!a);
	}

	/** Inline style for a segment: subtle background + stacked underlines. */
	function segStyle(seg: Segment): string {
		const anns = annotationsForSegment(seg);
		if (anns.length === 0) return '';
		// Innermost (smallest span) drives the background tint.
		const innermost = [...anns].sort((a, b) => a.end - a.start - (b.end - b.start))[0];
		const bg = app.codeIndex.get(innermost.code)?.color ?? '#888';
		const shadows = anns
			.map((a, i) => {
				const color = app.codeIndex.get(a.code)?.color ?? '#888';
				return `inset 0 ${-3 * (i + 1)}px 0 0 ${color}`;
			})
			.join(', ');
		return `background-color: color-mix(in srgb, ${bg} 18%, transparent); box-shadow: ${shadows};`;
	}

	function segTitle(seg: Segment): string {
		return annotationsForSegment(seg)
			.map((a) => app.codeIndex.get(a.code)?.labelPath ?? a.code)
			.join(', ');
	}

	function isSelected(seg: Segment): boolean {
		return !!app.selectedAnnotationId && seg.annotationIds.includes(app.selectedAnnotationId);
	}

	function syncScroll() {
		if (!highlightsEl || !textareaEl) return;
		highlightsEl.scrollTop = textareaEl.scrollTop;
		highlightsEl.scrollLeft = textareaEl.scrollLeft;
	}

	function selectAnnotationAt(offset: number) {
		const hits = app.displayAnnotations.filter((a) => a.start <= offset && offset < a.end);
		if (hits.length === 0) return;
		const innermost = [...hits].sort((a, b) => a.end - a.start - (b.end - b.start))[0];
		app.selectedAnnotationId = innermost.id;
	}

	function placeMenu(clientX: number, clientY: number) {
		const pad = 8;
		const width = 320;
		const height = 320;
		menuX = Math.min(clientX, window.innerWidth - width - pad);
		menuY = Math.min(clientY + 4, window.innerHeight - height - pad);
	}

	function handleSelection(ta: HTMLTextAreaElement, clientX: number, clientY: number) {
		const start = ta.selectionStart;
		const end = ta.selectionEnd;
		if (end <= start) {
			selectAnnotationAt(start);
			return;
		}

		if (app.rerangeAnnotationId) {
			app.updateAnnotationRange(app.rerangeAnnotationId, start, end);
			app.rerangeAnnotationId = null;
			ta.setSelectionRange(end, end);
			return;
		}

		pending = { start, end };
		placeMenu(clientX, clientY);
		query = '';
		menuOpen = true;
	}

	function onMouseUp(e: MouseEvent) {
		handleSelection(e.currentTarget as HTMLTextAreaElement, e.clientX, e.clientY);
	}

	function attachHighlights(el: HTMLDivElement) {
		highlightsEl = el;
		return () => {
			highlightsEl = null;
		};
	}

	function attachInput(el: HTMLTextAreaElement) {
		textareaEl = el;
		const onScroll = () => syncScroll();
		el.addEventListener('scroll', onScroll);
		$effect(() => {
			void app.displayBody;
			void segments;
			if (highlightsEl) {
				highlightsEl.scrollTop = el.scrollTop;
				highlightsEl.scrollLeft = el.scrollLeft;
			}
		});
		return () => {
			el.removeEventListener('scroll', onScroll);
			textareaEl = null;
		};
	}

	function assign(codePath: string) {
		if (!pending) return;
		app.addAnnotation(codePath, pending.start, pending.end);
		closeMenu();
		textareaEl?.focus();
	}

	function closeMenu() {
		menuOpen = false;
		pending = null;
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			closeMenu();
			app.rerangeAnnotationId = null;
			return;
		}
		if ((e.metaKey || e.ctrlKey) && e.key === 's') {
			e.preventDefault();
			if (app.isDirty) app.commitDraft();
		}
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="annotator">
	{#if app.rerangeAnnotationId}
		<div class="reranging">
			<span>Markiere den neuen Textbereich für diese Annotation.</span>
			<button type="button" onclick={() => (app.rerangeAnnotationId = null)}>Abbrechen</button>
		</div>
	{/if}
	<div class="editor">
		<div class="highlights" aria-hidden="true" {@attach attachHighlights}>
			{#each segments as seg (`${seg.start}-${seg.end}-${seg.annotationIds.join(',')}`)}
				<span
					class={['hl', seg.annotationIds.length > 0 && 'coded', isSelected(seg) && 'selected']}
					style={seg.annotationIds.length > 0 ? segStyle(seg) : undefined}
					title={seg.annotationIds.length > 0 ? segTitle(seg) : undefined}>{seg.text}</span
				>
			{/each}{#if app.displayBody.endsWith('\n')}<span class="hl"> </span>{/if}
		</div>
		<textarea
			class="input"
			{@attach attachInput}
			bind:value={() => app.displayBody, (v) => app.updateDraft(v)}
			onmouseup={onMouseUp}
			spellcheck="false"
			autocomplete="off"
			autocapitalize="off"
			wrap="soft"
			aria-label="Transkript bearbeiten und annotieren"
		></textarea>
	</div>
</div>

{#if menuOpen}
	<!-- Backdrop closes the menu on outside click. -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="backdrop" onclick={closeMenu}></div>
	<div class="menu" style="left: {menuX}px; top: {menuY}px;">
		<!-- svelte-ignore a11y_autofocus -->
		<input class="menu-search" placeholder="Code suchen…" bind:value={query} autofocus />
		{#if app.flatCodes.length === 0}
			<p class="menu-empty">Noch keine Codes. Lege rechts im Codebuch welche an.</p>
		{:else if filteredCodes.length === 0}
			<p class="menu-empty">Kein Code gefunden.</p>
		{:else}
			<ul class="menu-list">
				{#each filteredCodes as c (c.path)}
					<li>
						<button
							type="button"
							onclick={() => assign(c.path)}
							style="padding-left: {8 + c.depth * 14}px;"
						>
							<span class="dot" style="background: {c.color}"></span>
							<span class="menu-label">{c.label}</span>
							<span class="menu-path">{c.path}</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}

<style>
	.annotator {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.reranging {
		flex: none;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		background: #eff6ff;
		border: 1px solid #bfdbfe;
		color: #1e3a8a;
		border-radius: 0.5rem;
		padding: 0.5rem 0.75rem;
		margin: 0.5rem 0 0;
		font-size: 0.85rem;
	}
	.reranging button {
		flex: none;
		border: 1px solid #bfdbfe;
		background: white;
		color: #1e3a8a;
		border-radius: 0.375rem;
		padding: 0.25rem 0.6rem;
		font-size: 0.8rem;
		cursor: pointer;
	}
	.reranging button:hover {
		background: #dbeafe;
	}
	.editor {
		position: relative;
		flex: 1;
		min-height: 0;
		margin: 0.75rem 0 1rem;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		background: #fff;
	}
	.highlights,
	.input {
		position: absolute;
		inset: 0;
		box-sizing: border-box;
		margin: 0;
		padding: 0.75rem;
		border: none;
		border-radius: 0.5rem;
		font: 400 0.98rem/2.1 ui-serif, Georgia, 'Times New Roman', serif;
		letter-spacing: normal;
		word-spacing: normal;
		text-transform: none;
		white-space: pre-wrap;
		overflow-wrap: break-word;
		word-break: break-word;
		tab-size: 4;
		overflow-x: hidden;
		overflow-y: scroll;
		appearance: none;
	}
	.highlights {
		pointer-events: none;
		color: #1f2937;
		background: #fff;
		z-index: 0;
	}
	.hl {
		margin: 0;
		padding: 0;
		border: 0;
		border-radius: 2px;
	}
	.coded {
		border-radius: 2px;
	}
	.coded.selected {
		outline: 2px solid #111827;
		outline-offset: 1px;
	}
	.input {
		z-index: 1;
		color: transparent;
		caret-color: #111827;
		background: transparent;
		resize: none;
		outline: none;
	}
	.input:focus {
		box-shadow: inset 0 0 0 1px #9ca3af;
	}
	.input::selection {
		background: color-mix(in srgb, #93c5fd 45%, transparent);
	}
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
	}
	.menu {
		position: fixed;
		z-index: 50;
		width: 20rem;
		max-height: 20rem;
		overflow: auto;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
		padding: 0.4rem;
	}
	.menu-search {
		width: 100%;
		padding: 0.4rem 0.5rem;
		border: 1px solid #e5e7eb;
		border-radius: 0.375rem;
		margin-bottom: 0.35rem;
		font-size: 0.85rem;
	}
	.menu-empty {
		font-size: 0.8rem;
		color: #6b7280;
		padding: 0.5rem;
	}
	.menu-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.menu-list button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		text-align: left;
		padding: 0.35rem 0.5rem;
		border-radius: 0.375rem;
		font-size: 0.85rem;
		background: transparent;
		border: none;
		cursor: pointer;
	}
	.menu-list button:hover {
		background: #f3f4f6;
	}
	.dot {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 999px;
		flex: none;
	}
	.menu-label {
		font-weight: 500;
		color: #111827;
	}
	.menu-path {
		margin-left: auto;
		color: #9ca3af;
		font-size: 0.72rem;
	}
</style>
