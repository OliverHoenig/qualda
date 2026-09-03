<script lang="ts">
	import { app } from '$lib/state.svelte';

	const doc = $derived(app.activeDoc);
	const sorted = $derived(
		doc ? [...doc.annotations].sort((a, b) => a.start - b.start || a.end - b.end) : []
	);
</script>

<div class="list">
	<h2>Annotationen <span class="n">{sorted.length}</span></h2>
	{#if sorted.length === 0}
		<p class="hint">Markiere Text im Dokument und wähle einen Code, um zu annotieren.</p>
	{:else}
		<ul>
			{#each sorted as a (a.id)}
				{@const code = app.codeIndex.get(a.code)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<li
					class:selected={app.selectedAnnotationId === a.id}
					onclick={() => (app.selectedAnnotationId = a.id)}
				>
					<div class="top">
						<span class="dot" style="background: {code?.color ?? '#888'}"></span>
						<select
							value={a.code}
							onchange={(e) => app.updateAnnotationCode(a.id, e.currentTarget.value)}
							onclick={(e) => e.stopPropagation()}
						>
							{#each app.flatCodes as c (c.path)}
								<option value={c.path}>{c.labelPath}</option>
							{/each}
							{#if !code}
								<option value={a.code}>{a.code} (unbekannt)</option>
							{/if}
						</select>
						<button
							class="range"
							class:active={app.rerangeAnnotationId === a.id}
							title="Bereich ändern – danach neuen Text markieren"
							onclick={(e) => {
								e.stopPropagation();
								app.selectedAnnotationId = a.id;
								app.rerangeAnnotationId = app.rerangeAnnotationId === a.id ? null : a.id;
							}}
							aria-label="Bereich ändern">↔</button
						>
						<button
							class="del"
							title="Löschen"
							onclick={(e) => {
								e.stopPropagation();
								app.deleteAnnotation(a.id);
							}}>×</button
						>
					</div>
					{#if app.rerangeAnnotationId === a.id}
						<p class="range-hint">Markiere den neuen Textbereich im Dokument.</p>
					{/if}
					<p class="quote">{a.quote}</p>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.list {
		padding: 0.75rem;
	}
	h2 {
		font-size: 0.95rem;
		font-weight: 600;
		margin: 0 0 0.5rem;
	}
	.n {
		font-size: 0.75rem;
		color: #6b7280;
		font-weight: 400;
	}
	.hint {
		font-size: 0.8rem;
		color: #6b7280;
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
		border-radius: 0.5rem;
		padding: 0.5rem;
		cursor: pointer;
	}
	li:hover {
		background: #f9fafb;
	}
	li.selected {
		border-color: #111827;
		box-shadow: 0 0 0 1px #111827;
	}
	.top {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.dot {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 999px;
		flex: none;
	}
	select {
		flex: 1;
		min-width: 0;
		font-size: 0.8rem;
		padding: 0.2rem;
		border: 1px solid #e5e7eb;
		border-radius: 0.25rem;
	}
	.range {
		border: none;
		background: transparent;
		font-size: 1rem;
		line-height: 1;
		color: #9ca3af;
		cursor: pointer;
		flex: none;
	}
	.range:hover {
		color: #1d4ed8;
	}
	.range.active {
		color: #1d4ed8;
	}
	.del {
		border: none;
		background: transparent;
		font-size: 1.1rem;
		line-height: 1;
		color: #9ca3af;
		cursor: pointer;
		flex: none;
	}
	.del:hover {
		color: #b91c1c;
	}
	.range-hint {
		margin: 0.35rem 0 0;
		font-size: 0.75rem;
		color: #1d4ed8;
	}
	.quote {
		margin: 0.35rem 0 0;
		font-size: 0.8rem;
		color: #374151;
		font-style: italic;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
