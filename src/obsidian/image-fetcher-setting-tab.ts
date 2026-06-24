import { App, PluginSettingTab, SecretComponent, Setting } from "obsidian";
import type ImageFetcherPlugin from "src/main";
import { DEFAULT_INSTAGRAM_SCROLL_COUNT, DEFAULT_USER_AGENT } from "src/main";

export default class ImageFetcherSettingTab extends PluginSettingTab {
	plugin: ImageFetcherPlugin;

	constructor(app: App, plugin: ImageFetcherPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl).setName("General").setHeading();

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

		new Setting(containerEl).setName("Instagram").setHeading();

		// Instagram cookie
		new Setting(containerEl)
			.setName("Instagram cookie")
			.setDesc(
				"Sent only to Instagram requests. Select or create a secret " +
					"holding the full Cookie header (including sessionid) from a " +
					"logged-in browser session to fetch private or login-walled " +
					"posts. Stored securely in Obsidian's secret storage."
			)
			.addComponent((el) =>
				new SecretComponent(this.app, el)
					.setValue(this.plugin.settings.instagramCookieSecretId)
					.onChange(async (value) => {
						this.plugin.settings.instagramCookieSecretId = value;
						await this.plugin.saveSettings();
					})
			);

		// Name Instagram images by username
		new Setting(containerEl)
			.setName("Name Instagram images by username")
			.setDesc(
				"For Instagram URLs, name the saved image after the profile " +
					"username instead of the note title. Other sites and " +
					"Instagram URLs without a username (e.g. /p/<shortcode>) " +
					"still use the note title."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.instagramNameByUsername)
					.onChange(async (value) => {
						this.plugin.settings.instagramNameByUsername = value;
						await this.plugin.saveSettings();
					})
			);

		// Instagram auto-scroll count
		new Setting(containerEl)
			.setName("Instagram auto-scroll count")
			.setDesc(
				'How many times the embedded browser scrolls to load more ' +
					'posts when you click "Collect images". Set to 0 to disable ' +
					'auto-scroll. The "Collect loaded (no scroll)" button always ' +
					"ignores this and grabs only what you loaded by hand."
			)
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "0";
				return text
					.setPlaceholder(String(DEFAULT_INSTAGRAM_SCROLL_COUNT))
					.setValue(String(this.plugin.settings.instagramScrollCount))
					.onChange(async (value) => {
						const parsed = parseInt(value, 10);
						this.plugin.settings.instagramScrollCount =
							Number.isFinite(parsed) && parsed >= 0
								? parsed
								: DEFAULT_INSTAGRAM_SCROLL_COUNT;
						await this.plugin.saveSettings();
					});
			});

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

		new Setting(containerEl).setName("Logs").setHeading();

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
