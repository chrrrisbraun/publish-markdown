import { App, PluginSettingTab, Setting } from "obsidian";
import PublishMarkdownPlugin from "./main";

export interface PublishMarkdownSettings {
	apiToken: string;
	projectName: string;
	teamId: string;
}

export const DEFAULT_SETTINGS: PublishMarkdownSettings = {
	apiToken: "",
	projectName: "my-notes",
	teamId: "",
};

export class PublishSettingTab extends PluginSettingTab {
	plugin: PublishMarkdownPlugin;

	constructor(app: App, plugin: PublishMarkdownPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Vercel API token")
			.setDesc("Create a token at vercel.com/account/tokens and paste it here.")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.apiToken)
					.onChange(async (value) => {
						this.plugin.settings.apiToken = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Project name")
			.setDesc("Vercel project slug used when creating the deployment. Created automatically if it does not exist.")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.projectName)
					.onChange(async (value) => {
						this.plugin.settings.projectName = value.trim().toLowerCase();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Team ID")
			.setDesc("Your Vercel team ID. Leave blank for personal accounts.")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.teamId)
					.onChange(async (value) => {
						this.plugin.settings.teamId = value.trim();
						await this.plugin.saveSettings();
					})
			);

	}
}
