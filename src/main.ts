import { Notice, Plugin, TFile } from "obsidian";
import { BrowserFetchModal } from "./obsidian/browser-fetch-modal";
import ImageFetcherSettingTab from "./obsidian/image-fetcher-setting-tab";
import { ImagePickerModal } from "./obsidian/image-picker-modal";
import {
	fetchImagesFromUrl,
	isInstagramHost,
	type RequestOptions,
} from "./utils/http-utils";
import { saveImageToNote } from "./utils/save-image";

export interface ImageFetcherSettings {
	frontmatterUrlKey: string;
	frontmatterImageKey: string;
	instagramCookie: string;
	userAgent: string;
	debug: boolean;
}

export const DEFAULT_USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const DEFAULT_SETTINGS: ImageFetcherSettings = {
	frontmatterUrlKey: "url",
	frontmatterImageKey: "image",
	instagramCookie: "",
	userAgent: DEFAULT_USER_AGENT,
	debug: false,
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

		const requestOptions: RequestOptions = {
			instagramCookie: this.settings.instagramCookie,
			userAgent: this.settings.userAgent,
			debug: this.settings.debug,
		};

		// Instagram renders its grids client-side, so a plain HTTP fetch returns
		// nothing useful. Render the page in an embedded browser instead, where
		// the user is logged in and we can scroll to load posts and scrape them.
		if (isInstagramHost(url)) {
			new BrowserFetchModal(this.app, url, requestOptions, (images) => {
				this.presentImages(file, images, requestOptions);
			}).open();
			return;
		}

		const images = await fetchImagesFromUrl(url, requestOptions);
		this.presentImages(file, images, requestOptions);
	}

	/** Open the picker for the fetched images and save the chosen one. */
	private presentImages(
		file: TFile,
		images: string[],
		requestOptions: RequestOptions,
	) {
		if (images.length === 0) {
			new Notice("No images found at the URL");
			return;
		}

		new ImagePickerModal(this.app, images, async (chosen) => {
			try {
				await saveImageToNote(
					this.app,
					file,
					chosen,
					this.settings.frontmatterImageKey,
					requestOptions,
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
