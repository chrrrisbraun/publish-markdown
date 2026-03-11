import { Notice, Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS, PublishMarkdownSettings, PublishSettingTab } from "./settings";
import { VercelPublisher } from "./publisher";

export default class PublishMarkdownPlugin extends Plugin {
	settings!: PublishMarkdownSettings;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon("send", "Publish notes to Vercel", () => {
			void this.publishFolder();
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

		this.addCommand({
			id: "publish-all-notes",
			name: "Publish all notes",
			callback: () => { void this.publishFolder(); },
		});

		this.addSettingTab(new PublishSettingTab(this.app, this));
	}

	onunload() {}

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

	private async publishFolder() {
		if (!this.validateSettings()) return;

		const folder = this.settings.publishFolder;
		const allFiles = this.app.vault.getMarkdownFiles();
		const files = folder
			? allFiles.filter((f) =>
				f.path.startsWith(`${folder}/`) || f.path.startsWith(`${folder}\\`)
			)
			: allFiles;

		if (files.length === 0) {
			new Notice(`No Markdown files found${folder ? ` in "${folder}"` : ""}.`);
			return;
		}

		new Notice(`Publishing ${files.length} note${files.length === 1 ? "" : "s"}…`);
		try {
			const publisher = new VercelPublisher(this.app, this.settings);
			const result = await publisher.publishFiles(files);
			new Notice(`Published ${files.length} note${files.length === 1 ? "" : "s"} to https://${result.url}`, 10000);
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
