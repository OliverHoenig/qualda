<script lang="ts">
	import { app } from '$lib/state.svelte';
	import type { FlatCode } from '$lib/types';

	const CONTEXT = 80;

	interface Hit {
		docIndex: number;
		docTitle: string;
		annId: string;
		before: string;
		quote: string;
		after: string;
	}

	function collectHits(codePath: string): Hit[] {
		const hits: Hit[] = [];
		app.docs.forEach((doc, docIndex) => {
			for (const a of doc.annotations) {
				if (a.code !== codePath) continue;
				hits.push({
					docIndex,
					docTitle: doc.title ?? doc.name,
					annId: a.id,
					before: doc.body.slice(Math.max(0, a.start - CONTEXT), a.start),
					quote: a.quote || doc.body.slice(a.start, a.end),
					after: doc.body.slice(a.end, a.end + CONTEXT)
				});
			}
		});
		return hits;
	}

	const clusters = $derived(
		app.flatCodes
			.filter((c) => !app.clusterCodePath || c.path === app.clusterCodePath)
			.map((c: FlatCode) => ({ code: c, hits: collectHits(c.path) }))
			.filter((x) => x.hits.length > 0)
	);

	function openHit(hit: Hit) {
		app.openDoc(hit.docIndex);
		app.selectedAnnotationId = hit.annId;
	}
</script>

<div class="cluster">
	<div class="bar">
		<label>
			Filter:
			<select bind:value={app.clusterCodePath}>
				<option value={null}>Alle Codes</option>
				{#each app.flatCodes as c (c.path)}
					<option value={c.path}>{c.labelPath} ({app.countForCode(c.path)})</option>
				{/each}
			</select>
		</label>
	</div>

	{#if clusters.length === 0}
		<p class="empty">Noch keine annotierten Passagen für die Auswahl.</p>
	{/if}

	{#each clusters as { code, hits } (code.path)}
		<section>
			<h3>
				<span class="dot" style="background: {code.color}"></span>
				{code.labelPath}
				<span class="count">{hits.length}</span>
			</h3>
			<ul>
				{#each hits as hit, i (code.path + '-' + i)}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
					<li onclick={() => openHit(hit)}>
						<div class="src">{hit.docTitle}</div>
						<p class="passage">
							<span class="ctx">…{hit.before}</span><mark
								style="background: color-mix(in srgb, {code.color} 30%, transparent);"
								>{hit.quote}</mark
							><span class="ctx">{hit.after}…</span>
						</p>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</div>

<style>
	.cluster {
		height: 100%;
		overflow: auto;
		padding: 1rem 1.25rem 3rem;
	}
	.bar {
		position: sticky;
		top: 0;
		background: white;
		padding-bottom: 0.75rem;
		font-size: 0.85rem;
	}
	.bar select {
		margin-left: 0.4rem;
		padding: 0.3rem 0.5rem;
		border: 1px solid #e5e7eb;
		border-radius: 0.375rem;
	}
	.empty {
		color: #9ca3af;
		font-style: italic;
	}
	section {
		margin-bottom: 1.5rem;
	}
	h3 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.95rem;
		font-weight: 600;
		margin: 0 0 0.5rem;
		position: sticky;
		top: 2.75rem;
		background: white;
		padding: 0.25rem 0;
	}
	.dot {
		width: 0.8rem;
		height: 0.8rem;
		border-radius: 999px;
	}
	.count {
		font-size: 0.75rem;
		color: #6b7280;
		font-weight: 400;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	li {
		border: 1px solid #e5e7eb;
		border-left: 3px solid #e5e7eb;
		border-radius: 0.375rem;
		padding: 0.5rem 0.75rem;
		cursor: pointer;
	}
	li:hover {
		background: #f9fafb;
	}
	.src {
		font-size: 0.72rem;
		color: #9ca3af;
		margin-bottom: 0.25rem;
	}
	.passage {
		margin: 0;
		font-size: 0.88rem;
		line-height: 1.6;
		font-family: ui-serif, Georgia, 'Times New Roman', serif;
		white-space: pre-wrap;
	}
	.ctx {
		color: #9ca3af;
	}
	mark {
		color: #111827;
		padding: 0 1px;
		border-radius: 2px;
	}
</style>
