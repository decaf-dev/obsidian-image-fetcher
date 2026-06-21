import { Notice, Plugin, TFile } from "obsidian";
import { ImagePickerModal } from "./obsidian/image-picker-modal";
import { fetchImagesFromUrl } from "./utils/http-utils";
import { saveImageToNote } from "./utils/save-image";

export default class ImageFetcherPlugin extends Plugin {
	async onload() {
		this.addRibbonIcon("image", "Fetch images for URL", () => {
			this.fetchImagesForActiveNote();
		});

		this.addCommand({
			id: "fetch-images-for-url",
			name: "Fetch images for URL",
			callback: async () => {
				this.fetchImagesForActiveNote();
			},
		});
	}

	onunload() {}

	private async fetchImagesForActiveNote(file?: TFile) {
		if (!file) {
			const activeFile = this.app.workspace.getActiveFile();
			if (!activeFile) {
				new Notice("No file is open");
				return;
			}
			file = activeFile;
		}

		const frontmatter =
			this.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter) {
			new Notice("No frontmatter found in the current file");
			return;
		}

		const url = frontmatter.url;
		if (!url) {
			new Notice("No url property found in the current file");
			return;
		}

		const images = await fetchImagesFromUrl(url);
		if (images.length === 0) {
			new Notice("No images found at the URL");
			return;
		}

		const targetFile = file;
		new ImagePickerModal(this.app, images, async (chosen) => {
			try {
				await saveImageToNote(this.app, targetFile, chosen);
				new Notice("Saved image to note");
			} catch (error) {
				new Notice("Failed to save image");
				console.error(error);
			}
		}).open();
	}
}
