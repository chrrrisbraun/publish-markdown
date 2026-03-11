import { Notice, Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS, PublishMarkdownSettings, PublishSettingTab } from "./settings";
import { VercelPublisher } from "./publisher";

export default class PublishMarkdownPlugin extends Plugin {
	settings!: PublishMarkdownSettings;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon("send", "Publish current note to Vercel", () => {
			void this.publishCurrentNote();
		});

		this.addCommand({
			id: "publish-current-note",
			name: "Publish current note",
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (file && file.extension === "md") {
					if (!checking) void this.publishNote(file);
					return true;
				}
				return false;
			},
		});

		this.addSettingTab(new PublishSettingTab(this.app, this));
	}

	onunload() {}

	private async publishCurrentNote() {
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== "md") {
			new Notice("Open a Markdown note to publish.");
			return;
		}
		await this.publishNote(file);
	}

	private async publishNote(file: TFile) {
		if (!this.validateSettings()) return;

		new Notice(`Publishing "${file.basename}"…`);
		try {
			const publisher = new VercelPublisher(this.app, this.settings);
			const result = await publisher.publishFiles([file]);
			new Notice(`Published to https://${result.url}`, 8000);
		} catch (err) {
			console.error("[publish-markdown]", err);
			new Notice(`Publish failed: ${String(err instanceof Error ? err.message : err)}`, 8000);
		}
	}

	private validateSettings(): boolean {
		if (!this.settings.apiToken) {
			new Notice("Set your Vercel API token in plugin settings.");
			return false;
		}
		if (!this.settings.projectName) {
			new Notice("Set a project name in plugin settings.");
			return false;
		}
		return true;
	}

	async loadSettings() {
		const data = await this.loadData() as Partial<PublishMarkdownSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
