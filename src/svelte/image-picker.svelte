<script lang="ts">
	interface ImagePickerProps {
		imageUrls: string[];
		onSave: (chosen: string) => void;
	}

	let { imageUrls, onSave }: ImagePickerProps = $props();

	let selected = $state<string | null>(null);

	function select(url: string) {
		selected = url;
	}

	function save() {
		if (selected) onSave(selected);
	}
</script>

<div class="image-picker">
	<div class="picker-header">
		<h2>Choose an image</h2>
		<p class="image-count">{imageUrls.length} image{imageUrls.length === 1 ? "" : "s"} found</p>
	</div>

	{#if imageUrls.length === 0}
		<div class="empty-state">No images were found on this page.</div>
	{:else}
		<div class="image-grid">
			{#each imageUrls as url (url)}
				<button
					type="button"
					class="image-cell"
					class:selected={url === selected}
					onclick={() => select(url)}
					title={url}
				>
					<img src={url} alt="" loading="lazy" />
				</button>
			{/each}
		</div>
	{/if}

	<div class="picker-footer">
		<button class="save-button" type="button" onclick={save} disabled={!selected}>
			Save
		</button>
	</div>
</div>

<style>
	.image-picker {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.picker-header {
		padding: 0 0 1rem 0;
		border-bottom: 1px solid var(--background-modifier-border);
	}

	.picker-header h2 {
		margin: 0 0 0.25rem 0;
		font-size: 1.4rem;
		color: var(--text-normal);
	}

	.image-count {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.empty-state {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		color: var(--text-muted);
	}

	.image-grid {
		flex: 1;
		overflow-y: auto;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 0.75rem;
		padding: 1rem 0;
	}

	.image-cell {
		padding: 0;
		background: var(--background-secondary);
		border: 2px solid var(--background-modifier-border);
		border-radius: 6px;
		overflow: hidden;
		cursor: pointer;
		aspect-ratio: 1 / 1;
		transition: all 0.15s ease;
	}

	.image-cell:hover {
		border-color: var(--interactive-accent);
	}

	.image-cell.selected {
		border-color: var(--interactive-accent);
		box-shadow: 0 0 0 2px var(--interactive-accent);
	}

	.image-cell img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.picker-footer {
		padding: 1rem 0 0 0;
		border-top: 1px solid var(--background-modifier-border);
		display: flex;
		justify-content: flex-end;
	}

	.save-button {
		padding: 0.6rem 1.4rem;
		background: var(--interactive-accent);
		color: var(--text-on-accent);
		border: none;
		border-radius: 6px;
		font-size: 1rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.save-button:hover:not(:disabled) {
		background: var(--interactive-accent-hover);
	}

	.save-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
