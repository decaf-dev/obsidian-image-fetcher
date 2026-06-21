import { Notice, Plugin, TFile } from "obsidian";
import ImageFetcherSettingTab from "./obsidian/image-fetcher-setting-tab";
import { ImagePickerModal } from "./obsidian/image-picker-modal";
import { fetchImagesFromUrl } from "./utils/http-utils";
import { saveImageToNote } from "./utils/save-image";

export interface ImageFetcherSettings {
	frontmatterUrlKey: string;
	frontmatterImageKey: string;
}

const DEFAULT_SETTINGS: ImageFetcherSettings = {
	frontmatterUrlKey: "url",
	frontmatterImageKey: "image",
};

export default class ImageFetcherPlugin extends Plugin {
	settings: ImageFetcherSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

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

		this.addSettingTab(new ImageFetcherSettingTab(this.app, this));
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

		const url = frontmatter[this.settings.frontmatterUrlKey];
		if (!url) {
			new Notice(
				`No "${this.settings.frontmatterUrlKey}" property found in the current file`,
			);
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
				await saveImageToNote(
					this.app,
					targetFile,
					chosen,
					this.settings.frontmatterImageKey,
				);
				new Notice("Saved image to note");
			} catch (error) {
				new Notice("Failed to save image");
				console.error(error);
			}
		}).open();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
