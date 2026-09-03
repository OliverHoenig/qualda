<script lang="ts">
	import { app } from '$lib/state.svelte';
</script>

<div class="sidebar">
	<h2>Dokumente <span class="n">{app.docs.length}</span></h2>
	{#if app.docs.length === 0}
		<p class="hint">Keine .md-Dateien im Ordner.</p>
	{:else}
		<ul>
			{#each app.docs as doc, i (doc.path)}
				<li>
					<button class:active={i === app.activeIndex} onclick={() => app.openDoc(i)}>
						<span class="name">{doc.title ?? doc.name}</span>
						<span class="count">{doc.annotations.length}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.sidebar {
		padding: 0.75rem;
		height: 100%;
		overflow: auto;
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
		gap: 0.15rem;
	}
	button {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		width: 100%;
		text-align: left;
		padding: 0.4rem 0.5rem;
		border: none;
		background: transparent;
		border-radius: 0.375rem;
		cursor: pointer;
		font-size: 0.85rem;
	}
	button:hover {
		background: #f3f4f6;
	}
	button.active {
		background: #111827;
		color: white;
	}
	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.count {
		font-size: 0.72rem;
		opacity: 0.7;
		flex: none;
	}
</style>
