<script lang="ts">
	import { app } from '$lib/state.svelte';
	import DocSidebar from '$lib/components/DocSidebar.svelte';
	import CodebookPanel from '$lib/components/CodebookPanel.svelte';
	import Annotator from '$lib/components/Annotator.svelte';
	import AnnotationList from '$lib/components/AnnotationList.svelte';
	import ClusterView from '$lib/components/ClusterView.svelte';

	$effect(() => {
		app.init();
	});

	const saveLabel = $derived(
		app.saveStatus === 'saving'
			? 'speichert…'
			: app.saveStatus === 'saved'
				? 'gespeichert'
				: app.saveStatus === 'error'
					? 'Fehler beim Speichern'
					: ''
	);
</script>

<div class="app">
	<header>
		<div class="brand">Qualda</div>
		<form
			class="folder"
			onsubmit={(e) => {
				e.preventDefault();
				app.loadFolder(app.folderInput);
			}}
		>
			<input
				placeholder="/absoluter/pfad/zum/ordner"
				bind:value={app.folderInput}
				spellcheck="false"
			/>
			<button type="submit" disabled={app.loading}>{app.loading ? 'lädt…' : 'Laden'}</button>
		</form>

		<div class="views">
			<button class:active={app.view === 'annotate'} onclick={() => app.setView('annotate')}
				>Annotieren</button
			>
			<button class:active={app.view === 'cluster'} onclick={() => app.setView('cluster')}
				>Cluster</button
			>
		</div>

		<div class="save">{saveLabel}</div>
	</header>

	{#if app.errorMsg}
		<div class="error">{app.errorMsg}</div>
	{/if}

	{#if !app.folder}
		<div class="welcome">
			<h1>Qualitatives Annotations-Tool</h1>
			<p>
				Gib oben den absoluten Pfad zu einem Ordner mit <code>.md</code>-Transkripten ein und klicke
				auf <strong>Laden</strong>. Codes und Annotationen werden direkt in den Dateien gespeichert
				(Codebuch in <code>codebook.yaml</code>).
			</p>
		</div>
	{:else}
		<main>
			<aside class="left">
				<DocSidebar />
			</aside>

			<section class="center">
				{#if app.view === 'cluster'}
					<ClusterView />
				{:else if app.activeDoc}
					<div class="doc-head">
						<h1>{app.activeDoc.title ?? app.activeDoc.name}</h1>
						<div class="modes">
							{#if app.isDirty}
								<span class="dirty">Ungespeicherte Änderungen</span>
								<button class="primary" onclick={() => app.commitDraft()}>Sichern</button>
								<button onclick={() => app.discardDraft()}>Verwerfen</button>
							{:else}
								<span class="hint">Tippen zum Bearbeiten · Markieren zum Annotieren</span>
							{/if}
						</div>
					</div>
					{#key app.activeDoc.path}
						<Annotator />
					{/key}
				{:else}
					<p class="empty">Wähle links ein Dokument.</p>
				{/if}
			</section>

			<aside class="right">
				<div class="right-top"><CodebookPanel /></div>
				{#if app.view === 'annotate' && app.activeDoc}
					<div class="right-bottom"><AnnotationList /></div>
				{/if}
			</aside>
		</main>
	{/if}
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: #fff;
		color: #111827;
	}
	header {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.6rem 1rem;
		border-bottom: 1px solid #e5e7eb;
		flex: none;
	}
	.brand {
		font-weight: 700;
		font-size: 1.05rem;
	}
	.folder {
		display: flex;
		gap: 0.4rem;
		flex: 1;
		max-width: 40rem;
	}
	.folder input {
		flex: 1;
		padding: 0.4rem 0.6rem;
		border: 1px solid #e5e7eb;
		border-radius: 0.375rem;
		font-size: 0.85rem;
		font-family: ui-monospace, monospace;
	}
	.folder button,
	.views button,
	.modes button {
		padding: 0.4rem 0.7rem;
		border: 1px solid #e5e7eb;
		background: #f9fafb;
		border-radius: 0.375rem;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.views {
		display: flex;
		gap: 0.3rem;
	}
	.views button.active {
		background: #111827;
		color: white;
		border-color: #111827;
	}
	.save {
		font-size: 0.75rem;
		color: #6b7280;
		min-width: 6rem;
		text-align: right;
	}
	.error {
		background: #fef2f2;
		color: #b91c1c;
		padding: 0.5rem 1rem;
		font-size: 0.85rem;
		border-bottom: 1px solid #fecaca;
	}
	.welcome {
		max-width: 40rem;
		margin: 4rem auto;
		padding: 0 1.5rem;
	}
	.welcome h1 {
		font-size: 1.5rem;
		font-weight: 700;
	}
	.welcome p {
		color: #4b5563;
		line-height: 1.6;
	}
	code {
		background: #f3f4f6;
		padding: 0.1rem 0.3rem;
		border-radius: 0.25rem;
		font-size: 0.85em;
	}
	main {
		flex: 1;
		display: grid;
		grid-template-columns: 220px 1fr 340px;
		min-height: 0;
	}
	.left {
		border-right: 1px solid #e5e7eb;
		min-height: 0;
	}
	.center {
		display: flex;
		flex-direction: column;
		min-height: 0;
		padding: 0 1.25rem;
	}
	.doc-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 0 0.5rem;
		border-bottom: 1px solid #f3f4f6;
		flex: none;
	}
	.doc-head h1 {
		font-size: 1.1rem;
		font-weight: 600;
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.modes {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		flex: none;
	}
	.modes button.primary {
		background: #111827;
		color: white;
		border-color: #111827;
	}
	.modes button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.dirty {
		font-size: 0.75rem;
		color: #b45309;
		margin-right: 0.35rem;
		white-space: nowrap;
	}
	.hint {
		font-size: 0.75rem;
		color: #6b7280;
		white-space: nowrap;
	}
	.right {
		border-left: 1px solid #e5e7eb;
		display: flex;
		flex-direction: column;
		min-height: 0;
	}
	.right-top {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}
	.right-bottom {
		flex: 1;
		min-height: 0;
		overflow: auto;
		border-top: 1px solid #e5e7eb;
	}
	.empty {
		color: #9ca3af;
		font-style: italic;
		padding: 2rem 0;
	}
</style>
