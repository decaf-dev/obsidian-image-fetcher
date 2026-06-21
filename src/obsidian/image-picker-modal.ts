import { App, Modal } from "obsidian";
import { mount, unmount } from "svelte";
import ImagePicker from "../svelte/image-picker.svelte";

export class ImagePickerModal extends Modal {
	private svelteComponent: ReturnType<typeof mount> | null = null;
	private imageUrls: string[];
	private onSave: (chosen: string) => void;

	constructor(
		app: App,
		imageUrls: string[],
		onSave: (chosen: string) => void,
	) {
		super(app);
		this.imageUrls = imageUrls;
		this.onSave = onSave;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("image-picker-modal");

		this.svelteComponent = mount(ImagePicker, {
			target: contentEl,
			props: {
				imageUrls: this.imageUrls,
				onSave: (chosen: string) => {
					this.onSave(chosen);
					this.close();
				},
			},
		});

		const modalEl = contentEl.closest(".modal") as HTMLElement | null;
		if (modalEl) {
			modalEl.style.width = "720px";
			modalEl.style.maxWidth = "90vw";
			// Cap height so long lists scroll inside the modal, but let shorter
			// lists size to their content instead of forcing a full-height box.
			modalEl.style.maxHeight = "80vh";
		}
	}

	onClose() {
		if (this.svelteComponent) {
			unmount(this.svelteComponent);
			this.svelteComponent = null;
		}
		this.contentEl.empty();
	}
}
