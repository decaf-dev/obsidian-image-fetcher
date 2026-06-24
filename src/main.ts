import { Notice, Plugin, TFile } from "obsidian";
import { BrowserFetchModal } from "./obsidian/browser-fetch-modal";
import ImageFetcherSettingTab from "./obsidian/image-fetcher-setting-tab";
import { ImagePickerModal } from "./obsidian/image-picker-modal";
import {
	fetchImagesFromUrl,
	imageNameFromUrl,
	isInstagramHost,
	type RequestOptions,
} from "./utils/http-utils";
import { saveImageToNote } from "./utils/save-image";

export interface ImageFetcherSettings {
	frontmatterUrlKey: string;
	frontmatterImageKey: string;
	imageNamePrefixes: string[];
	instagramCookieSecretId: string;
	instagramScrollCount: number;
	userAgent: string;
	debug: boolean;
}

export const DEFAULT_USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export const DEFAULT_INSTAGRAM_SCROLL_COUNT = 4;

const DEFAULT_SETTINGS: ImageFetcherSettings = {
	frontmatterUrlKey: "url",
	frontmatterImageKey: "image",
	imageNamePrefixes: [],
	instagramCookieSecretId: "",
	instagramScrollCount: DEFAULT_INSTAGRAM_SCROLL_COUNT,
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

		const instagramCookie = this.settings.instagramCookieSecretId
			? (this.app.secretStorage.getSecret(
					this.settings.instagramCookieSecretId,
				) ?? "")
			: "";

		const requestOptions: RequestOptions = {
			instagramCookie,
			userAgent: this.settings.userAgent,
			debug: this.settings.debug,
		};

		// Instagram renders its grids client-side, so a plain HTTP fetch returns
		// nothing useful. Render the page in an embedded browser instead, where
		// the user is logged in and we can scroll to load posts and scrape them.
		if (isInstagramHost(url)) {
			new BrowserFetchModal(
				this.app,
				url,
				requestOptions,
				this.settings.instagramScrollCount,
				(images) => {
					this.presentImages(file, url, images, requestOptions);
				},
			).open();
			return;
		}

		const images = await fetchImagesFromUrl(url, requestOptions);
		this.presentImages(file, url, images, requestOptions);
	}

	/**
	 * Choose the filename stem for the saved image. If the note URL matches one
	 * of the configured `imageNamePrefixes`, the path segment after that prefix
	 * is used (e.g. prefix `https://instagram.com/p/` → the shortcode);
	 * otherwise it falls back to the note title.
	 */
	private resolveBaseName(file: TFile, url: string): string {
		return (
			imageNameFromUrl(url, this.settings.imageNamePrefixes) ??
			file.basename
		);
	}

	/** Open the picker for the fetched images and save the chosen one. */
	private presentImages(
		file: TFile,
		url: string,
		images: string[],
		requestOptions: RequestOptions,
	) {
		if (images.length === 0) {
			new Notice("No images found at the URL");
			return;
		}

		const baseName = this.resolveBaseName(file, url);

		new ImagePickerModal(this.app, images, async (chosen) => {
			try {
				await saveImageToNote(
					this.app,
					file,
					chosen,
					this.settings.frontmatterImageKey,
					requestOptions,
					baseName,
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
