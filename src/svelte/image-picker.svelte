<script lang="ts">
	import VirtualList from "svelte-tiny-virtual-list";

	interface ImagePickerProps {
		imageUrls: string[];
		onSave: (chosen: string) => void;
	}

	let { imageUrls, onSave }: ImagePickerProps = $props();

	let selected = $state<string | null>(null);

	const COLUMNS = 2;
	const GAP = 12;
	const CELL_BORDER = 2;
	// Placeholder aspect (square) for images whose real dimensions haven't
	// loaded yet — refined per image on its `load` event.
	const DEFAULT_ASPECT = 1;

	let containerWidth = $state(0);
	let viewportHeight = $state(window.innerHeight);
	// Bumped whenever an image's measured aspect changes, so the derived
	// `itemSize`/`listHeight` recompute (and the virtual list re-lays-out rows).
	let sizeVersion = $state(0);
	// index → naturalWidth / naturalHeight, filled in as images load.
	const aspects: number[] = [];

	const rowCount = $derived(Math.ceil(imageUrls.length / COLUMNS));
	// Pixel width of one column inside the row's grid (one gap between columns).
	const columnWidth = $derived(Math.max(0, (containerWidth - GAP) / COLUMNS));

	// Displayed height of cell `i`: the column-wide image at its own aspect
	// ratio, plus the cell's borders. Rows take the tallest cell they hold.
	function cellHeight(i: number): number {
		const aspect = aspects[i] > 0 ? aspects[i] : DEFAULT_ASPECT;
		return (columnWidth - CELL_BORDER * 2) / aspect + CELL_BORDER * 2;
	}
	function rowHeight(rowIndex: number): number {
		const start = rowIndex * COLUMNS;
		const end = Math.min(start + COLUMNS, imageUrls.length);
		let height = 0;
		for (let i = start; i < end; i++) height = Math.max(height, cellHeight(i));
		return Math.ceil(height) + GAP;
	}

	// New closure whenever width or any measured aspect changes — the reference
	// change is what makes the virtual list recompute its layout. The guard just
	// reads both reactive deps (sizeVersion bumps as images measure).
	const itemSize = $derived.by(() => {
		if (sizeVersion < 0 || columnWidth < 0) return () => 0;
		return (rowIndex: number) => rowHeight(rowIndex);
	});
	// Size the scroll area to its content, capped so it never crowds the modal.
	const listHeight = $derived.by(() => {
		if (sizeVersion < 0) return 0; // read sizeVersion so this re-runs on load
		let total = 0;
		for (let r = 0; r < rowCount; r++) total += rowHeight(r);
		return Math.min(total, Math.round(viewportHeight * 0.6));
	});

	function rowUrls(rowIndex: number): string[] {
		const start = rowIndex * COLUMNS;
		return imageUrls.slice(start, start + COLUMNS);
	}

	function onImageLoad(event: Event, index: number) {
		const img = event.currentTarget as HTMLImageElement;
		if (img.naturalWidth > 0 && img.naturalHeight > 0) {
			const aspect = img.naturalWidth / img.naturalHeight;
			if (aspects[index] !== aspect) {
				aspects[index] = aspect;
				sizeVersion++;
			}
		}
	}

	function select(url: string) {
		selected = url;
	}

	function save() {
		if (selected) onSave(selected);
	}

	$effect(() => {
		const onResize = () => (viewportHeight = window.innerHeight);
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	});
</script>

<div class="image-picker">
	<div class="picker-header">
		<h2>Choose an image</h2>
		<p class="image-count">{imageUrls.length} image{imageUrls.length === 1 ? "" : "s"} found</p>
	</div>

	{#if imageUrls.length === 0}
		<div class="empty-state">No images were found on this page.</div>
	{:else}
		<div class="list-region" bind:clientWidth={containerWidth}>
			{#if containerWidth > 0}
				<VirtualList
					width="100%"
					height={listHeight}
					itemCount={rowCount}
					{itemSize}
					estimatedItemSize={columnWidth}
				>
					<div
						slot="item"
						let:index
						let:style
						class="virtual-row"
						style="{style}display:grid;grid-template-columns:repeat({COLUMNS},minmax(0,1fr));gap:{GAP}px;padding-bottom:{GAP}px;box-sizing:border-box;align-items:start;"
					>
						{#each rowUrls(index) as url, col (url)}
							<div
								role="button"
								tabindex="0"
								class="image-cell"
								class:selected={url === selected}
								onclick={() => select(url)}
								onkeydown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										select(url);
									}
								}}
								title={url}
							>
								<img
									src={url}
									alt=""
									loading="lazy"
									onload={(e) => onImageLoad(e, index * COLUMNS + col)}
								/>
							</div>
						{/each}
					</div>
				</VirtualList>
			{/if}
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
	}

	.picker-header {
		flex-shrink: 0;
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

	.list-region {
		/* Full width so column count can be measured; the virtual list owns its
		   own (content-capped) height and scrolling. */
		width: 100%;
		padding: 1rem 0;
	}

	.image-cell {
		padding: 0;
		background: var(--background-secondary);
		border: 2px solid var(--background-modifier-border);
		border-radius: 6px;
		overflow: hidden;
		cursor: pointer;
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
	}

	.image-cell:hover {
		border-color: var(--interactive-accent);
	}

	.image-cell.selected {
		border-color: var(--interactive-accent);
		box-shadow: 0 0 0 2px var(--interactive-accent);
	}

	.image-cell img {
		/* Full column width at the image's natural aspect ratio (no cropping);
		   the row's height is computed to match the taller cell. */
		display: block;
		width: 100%;
		height: auto;
	}

	.picker-footer {
		flex-shrink: 0;
		padding: 1rem 0 0 0;
		border-top: 1px solid var(--background-modifier-border);
		background: var(--background-primary);
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
