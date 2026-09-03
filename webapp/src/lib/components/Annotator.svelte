<script lang="ts">
	import { app } from '$lib/state.svelte';
	import { buildSegments, type Segment } from '$lib/format/segments';
	import type { Annotation } from '$lib/types';

	let container = $state<HTMLDivElement | null>(null);

	// Floating code picker shown after a text selection.
	let menuOpen = $state(false);
	let menuX = $state(0);
	let menuY = $state(0);
	let query = $state('');
	let pending = $state<{ start: number; end: number } | null>(null);

	const doc = $derived(app.activeDoc);
	const segments = $derived(doc ? buildSegments(doc.body, doc.annotations) : []);

	const filteredCodes = $derived(
		app.flatCodes.filter(
			(c) =>
				!query.trim() ||
				c.labelPath.toLowerCase().includes(query.toLowerCase()) ||
				c.path.toLowerCase().includes(query.toLowerCase())
		)
	);

	function annotationsForSegment(seg: Segment): Annotation[] {
		if (!doc) return [];
		return seg.annotationIds
			.map((id) => doc.annotations.find((a) => a.id === id))
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

	function globalOffset(node: Node, offset: number): number {
		if (node.nodeType === Node.TEXT_NODE) {
			const span = (node.parentElement as HTMLElement | null)?.closest<HTMLElement>('[data-start]');
			if (!span) return -1;
			return Number(span.dataset.start) + offset;
		}
		const el = node as HTMLElement;
		if (el.dataset?.start !== undefined) return Number(el.dataset.start);
		const child = el.childNodes[offset] as HTMLElement | undefined;
		if (child?.dataset?.start !== undefined) return Number(child.dataset.start);
		const prev = el.childNodes[offset - 1] as HTMLElement | undefined;
		if (prev?.dataset?.start !== undefined)
			return Number(prev.dataset.start) + (prev.textContent?.length ?? 0);
		return -1;
	}

	function onMouseUp() {
		const sel = window.getSelection();
		if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !container || !doc) {
			return;
		}
		const range = sel.getRangeAt(0);
		if (!container.contains(range.commonAncestorContainer)) return;
		const a = globalOffset(range.startContainer, range.startOffset);
		const b = globalOffset(range.endContainer, range.endOffset);
		if (a < 0 || b < 0) return;
		const start = Math.min(a, b);
		const end = Math.max(a, b);
		if (end <= start) return;
		pending = { start, end };
		const rect = range.getBoundingClientRect();
		menuX = rect.left;
		menuY = rect.bottom + 4;
		query = '';
		menuOpen = true;
	}

	function assign(codePath: string) {
		if (!pending) return;
		app.addAnnotation(codePath, pending.start, pending.end);
		closeMenu();
		window.getSelection()?.removeAllRanges();
	}

	function closeMenu() {
		menuOpen = false;
		pending = null;
	}

	function onSegmentClick(seg: Segment) {
		const anns = annotationsForSegment(seg);
		if (anns.length === 0) return;
		// Focus the innermost annotation for the inspector.
		const innermost = [...anns].sort((a, b) => a.end - a.start - (b.end - b.start))[0];
		app.selectedAnnotationId = innermost.id;
	}

	$effect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') closeMenu();
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

<div class="annotator">
	{#if !doc}
		<p class="empty">Kein Dokument geöffnet.</p>
	{:else if doc.body.trim() === ''}
		<p class="empty">Dieses Dokument ist leer.</p>
	{:else}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div bind:this={container} class="text" onmouseup={onMouseUp}>
			{#each segments as seg (seg.start + '-' + seg.end)}
				{#if seg.annotationIds.length > 0}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<span
						data-start={seg.start}
						class="coded"
						class:selected={isSelected(seg)}
						style={segStyle(seg)}
						title={segTitle(seg)}
						onclick={() => onSegmentClick(seg)}>{seg.text}</span
					>
				{:else}
					<span data-start={seg.start}>{seg.text}</span>
				{/if}
			{/each}
		</div>
	{/if}
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
		height: 100%;
		overflow: auto;
	}
	.text {
		white-space: pre-wrap;
		word-break: break-word;
		line-height: 2.1;
		font-size: 0.98rem;
		padding: 0.5rem 0.25rem 3rem;
		font-family: ui-serif, Georgia, 'Times New Roman', serif;
		color: #1f2937;
	}
	.coded {
		cursor: pointer;
		border-radius: 2px;
		padding-bottom: 1px;
	}
	.coded.selected {
		outline: 2px solid #111827;
		outline-offset: 1px;
	}
	.empty {
		color: #9ca3af;
		font-style: italic;
		padding: 2rem 0.5rem;
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
