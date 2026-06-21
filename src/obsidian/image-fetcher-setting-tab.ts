import { App, PluginSettingTab, Setting } from "obsidian";
import type ImageFetcherPlugin from "src/main";
import { DEFAULT_USER_AGENT } from "src/main";

export default class ImageFetcherSettingTab extends PluginSettingTab {
	plugin: ImageFetcherPlugin;

	constructor(app: App, plugin: ImageFetcherPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", { text: "Image Fetcher Settings" });

		// Frontmatter URL key
		new Setting(containerEl)
			.setName("Frontmatter URL key")
			.setDesc("The property name to read the page URL from in frontmatter")
			.addText((text) =>
				text
					.setPlaceholder("url")
					.setValue(this.plugin.settings.frontmatterUrlKey)
					.onChange(async (value) => {
						this.plugin.settings.frontmatterUrlKey = value || "url";
						await this.plugin.saveSettings();
					})
			);

		// Frontmatter image key
		new Setting(containerEl)
			.setName("Frontmatter image key")
			.setDesc(
				"The property name to write the saved image to in frontmatter"
			)
			.addText((text) =>
				text
					.setPlaceholder("image")
					.setValue(this.plugin.settings.frontmatterImageKey)
					.onChange(async (value) => {
						this.plugin.settings.frontmatterImageKey =
							value || "image";
						await this.plugin.saveSettings();
					})
			);

		// Instagram cookie
		new Setting(containerEl)
			.setName("Instagram cookie")
			.setDesc(
				"Sent only to Instagram requests. Paste the full Cookie header " +
					"(including sessionid) from a logged-in browser session to " +
					"fetch private or login-walled posts. Stored in plaintext in " +
					"the plugin's data."
			)
			.addTextArea((text) =>
				text
					.setPlaceholder("sessionid=...; ds_user_id=...")
					.setValue(this.plugin.settings.instagramCookie)
					.onChange(async (value) => {
						this.plugin.settings.instagramCookie = value;
						await this.plugin.saveSettings();
					})
			);

		// User-Agent
		new Setting(containerEl)
			.setName("User-Agent")
			.setDesc(
				"Sent with every request. A real browser User-Agent helps " +
					"Instagram return image metadata. Leave blank to use the default."
			)
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_USER_AGENT)
					.setValue(this.plugin.settings.userAgent)
					.onChange(async (value) => {
						this.plugin.settings.userAgent =
							value || DEFAULT_USER_AGENT;
						await this.plugin.saveSettings();
					})
			);

		// Debug logging
		new Setting(containerEl)
			.setName("Debug logging")
			.setDesc(
				"Log request details to the developer console " +
					"(Ctrl/Cmd+Opt+I). The cookie value is never logged."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.debug)
					.onChange(async (value) => {
						this.plugin.settings.debug = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
