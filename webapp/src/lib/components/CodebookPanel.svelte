<script lang="ts">
	import { app } from '$lib/state.svelte';

	let newTop = $state('');
	let addingChildFor = $state<string | null>(null);
	let childLabel = $state('');

	function addTop() {
		app.addTopCode(newTop);
		newTop = '';
	}

	function startAddChild(path: string) {
		addingChildFor = path;
		childLabel = '';
	}

	function commitChild() {
		if (addingChildFor && childLabel.trim()) {
			app.addChildCode(addingChildFor, childLabel);
		}
		addingChildFor = null;
		childLabel = '';
	}

	function del(path: string, label: string) {
		const count = app.countForCode(path);
		const suffix = count > 0 ? ` Es gibt ${count} Annotation(en) mit diesem Code.` : '';
		if (confirm(`Code "${label}" wirklich löschen?${suffix}`)) {
			app.removeCodePath(path);
		}
	}
</script>

<div class="panel">
	<div class="head">
		<h2>Codebuch</h2>
		<span class="status" class:saving={app.codebookStatus === 'saving'}>
			{app.codebookStatus === 'saving'
				? 'speichert…'
				: app.codebookStatus === 'saved'
					? 'gespeichert'
					: app.codebookStatus === 'error'
						? 'Fehler'
						: ''}
		</span>
	</div>

	{#if app.flatCodes.length === 0}
		<p class="hint">Noch keine Codes. Lege unten deinen ersten Code an.</p>
	{/if}

	<ul class="codes">
		{#each app.flatCodes as c (c.path)}
			<li style="padding-left: {c.depth * 14}px;">
				<div class="row">
					<input
						class="color"
						type="color"
						value={c.color}
						oninput={(e) => app.editCode(c.path, { color: e.currentTarget.value })}
						title="Farbe"
					/>
					<input
						class="label"
						value={c.label}
						onchange={(e) => app.editCode(c.path, { label: e.currentTarget.value })}
					/>
					<span class="count" title="Annotationen mit diesem Code">{app.countForCode(c.path)}</span>
					<button class="mini" title="Subcode hinzufügen" onclick={() => startAddChild(c.path)}
						>+</button
					>
					<button class="mini danger" title="Löschen" onclick={() => del(c.path, c.label)}>×</button
					>
				</div>
				<input
					class="desc"
					placeholder="Beschreibung (optional)"
					value={c.description ?? ''}
					onchange={(e) => app.editCode(c.path, { description: e.currentTarget.value })}
				/>
				{#if addingChildFor === c.path}
					<div class="add-child">
						<!-- svelte-ignore a11y_autofocus -->
						<input
							placeholder="Subcode-Name"
							bind:value={childLabel}
							onkeydown={(e) => e.key === 'Enter' && commitChild()}
							autofocus
						/>
						<button class="mini" onclick={commitChild}>OK</button>
						<button class="mini" onclick={() => (addingChildFor = null)}>Abbr.</button>
					</div>
				{/if}
			</li>
		{/each}
	</ul>

	<div class="add-top">
		<input
			placeholder="Neuer Code…"
			bind:value={newTop}
			onkeydown={(e) => e.key === 'Enter' && addTop()}
		/>
		<button onclick={addTop} disabled={!newTop.trim()}>Hinzufügen</button>
	</div>
</div>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		padding: 0.75rem;
		gap: 0.5rem;
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}
	h2 {
		font-size: 0.95rem;
		font-weight: 600;
		margin: 0;
	}
	.status {
		font-size: 0.7rem;
		color: #16a34a;
	}
	.status.saving {
		color: #9ca3af;
	}
	.hint {
		font-size: 0.8rem;
		color: #6b7280;
	}
	.codes {
		list-style: none;
		margin: 0;
		padding: 0;
		overflow: auto;
		flex: 1;
	}
	.codes li {
		margin-bottom: 0.5rem;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	.color {
		width: 1.6rem;
		height: 1.6rem;
		padding: 0;
		border: 1px solid #e5e7eb;
		border-radius: 0.25rem;
		background: none;
		flex: none;
		cursor: pointer;
	}
	.label {
		flex: 1;
		min-width: 0;
		padding: 0.25rem 0.4rem;
		border: 1px solid transparent;
		border-radius: 0.25rem;
		font-size: 0.85rem;
		font-weight: 500;
	}
	.label:hover,
	.label:focus {
		border-color: #e5e7eb;
		outline: none;
	}
	.count {
		font-size: 0.72rem;
		color: #6b7280;
		min-width: 1.2rem;
		text-align: right;
	}
	.desc {
		width: 100%;
		margin-top: 0.15rem;
		padding: 0.2rem 0.4rem;
		border: 1px solid transparent;
		border-radius: 0.25rem;
		font-size: 0.75rem;
		color: #6b7280;
	}
	.desc:hover,
	.desc:focus {
		border-color: #e5e7eb;
		outline: none;
	}
	.mini {
		border: 1px solid #e5e7eb;
		background: #f9fafb;
		border-radius: 0.25rem;
		width: 1.5rem;
		height: 1.5rem;
		font-size: 0.9rem;
		line-height: 1;
		cursor: pointer;
		flex: none;
	}
	.mini:hover {
		background: #f3f4f6;
	}
	.mini.danger:hover {
		background: #fee2e2;
		color: #b91c1c;
	}
	.add-child {
		display: flex;
		gap: 0.3rem;
		margin-top: 0.3rem;
	}
	.add-child input {
		flex: 1;
		padding: 0.25rem 0.4rem;
		border: 1px solid #e5e7eb;
		border-radius: 0.25rem;
		font-size: 0.8rem;
	}
	.add-top {
		display: flex;
		gap: 0.4rem;
		border-top: 1px solid #e5e7eb;
		padding-top: 0.6rem;
	}
	.add-top input {
		flex: 1;
		padding: 0.4rem 0.5rem;
		border: 1px solid #e5e7eb;
		border-radius: 0.375rem;
		font-size: 0.85rem;
	}
	.add-top button {
		padding: 0.4rem 0.7rem;
		border: none;
		background: #111827;
		color: white;
		border-radius: 0.375rem;
		font-size: 0.8rem;
		cursor: pointer;
	}
	.add-top button:disabled {
		opacity: 0.4;
		cursor: default;
	}
</style>
