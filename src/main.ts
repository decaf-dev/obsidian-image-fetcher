import { Notice, Plugin, TFile, normalizePath } from "obsidian";
import ImageFetcherSettingTab from "./obsidian/image-fetcher-setting-tab";
import { fetchTitleFromUrl } from "./utils/http-utils";
import { formatTitleForMacOS } from "./utils/title-utils";
interface ImageFetcherSettings {
	appendNumberOnDuplicate: boolean;
}

const DEFAULT_SETTINGS: ImageFetcherSettings = {
	appendNumberOnDuplicate: true,
};

export default class ImageFetcherPlugin extends Plugin {
	settings: ImageFetcherSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon("image", "Fetch images for URL", () => {
			this.renameToUrlTitle();
		});

		this.addCommand({
			id: "fetch-images-for-url",
			name: "Fetch images for URL",
			callback: async () => {
				this.renameToUrlTitle();
			},
		});

		this.addSettingTab(new ImageFetcherSettingTab(this.app, this));
	}

	onunload() {}

	private async renameToUrlTitle(file?: TFile) {
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

		const title = await fetchTitleFromUrl(url);
		if (!title) {
			new Notice("Failed to fetch title from URL");
			return;
		}

		try {
			const formattedTitle = formatTitleForMacOS(title);

			const targetPath = this.settings.appendNumberOnDuplicate
				? this.resolveAvailablePath(file, formattedTitle)
				: normalizePath(
						file.parent
							? `${file.parent.path}/${formattedTitle}.md`
							: `${formattedTitle}.md`,
					);

			await this.app.vault.rename(file, targetPath);
			new Notice(`Renamed file to ${targetPath}`);
		} catch (error) {
			new Notice("Failed to rename file");
			console.error(error);
		}
	}

	private resolveAvailablePath(file: TFile, baseName: string): string {
		const dir = file.parent ? file.parent.path : "";
		const build = (name: string) =>
			normalizePath(dir ? `${dir}/${name}.md` : `${name}.md`);

		let candidate = build(baseName);
		let counter = 1;
		// Skip names already taken by a *different* file; renaming a file to its
		// own current name is a no-op and must not get a number appended.
		while (true) {
			const existing = this.app.vault.getAbstractFileByPath(candidate);
			if (!existing || existing.path === file.path) return candidate;
			candidate = build(`${baseName} ${counter}`);
			counter++;
		}
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
