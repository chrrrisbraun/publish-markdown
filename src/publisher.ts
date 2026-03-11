import { marked } from "marked";
import { App, requestUrl, TFile } from "obsidian";
import { PublishMarkdownSettings } from "./settings";

// Convert a note name to a URL-friendly slug
function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

// Replace Obsidian [[wikilinks]] with relative HTML links
function resolveWikilinks(markdown: string): string {
	return markdown.replace(
		/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
		(_, target: string, display?: string) => {
			const slug = slugify(target.trim());
			const text = display?.trim() ?? target.trim();
			return `[${text}](/${slug}.html)`;
		}
	);
}

function renderHtmlPage(title: string, body: string, isIndex = false): string {
	const nav = isIndex
		? ""
		: `<nav><a href="/index.html">← All notes</a></nav>`;

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      max-width: 720px;
      margin: 0 auto;
      padding: 2rem 1.25rem 4rem;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      font-size: 1rem;
      line-height: 1.7;
      color: #1a1a1a;
    }
    nav { margin-bottom: 2rem; }
    nav a { color: #0070f3; text-decoration: none; font-size: 0.9rem; }
    nav a:hover { text-decoration: underline; }
    h1, h2, h3, h4 { line-height: 1.3; margin-top: 2rem; }
    a { color: #0070f3; }
    pre {
      background: #f5f5f5;
      border: 1px solid #e5e5e5;
      border-radius: 6px;
      padding: 1rem;
      overflow-x: auto;
    }
    code {
      font-family: "SF Mono", Menlo, Consolas, monospace;
      font-size: 0.875em;
      background: #f5f5f5;
      padding: 0.1em 0.3em;
      border-radius: 3px;
    }
    pre code { background: none; padding: 0; }
    blockquote {
      border-left: 4px solid #ddd;
      margin: 1.5rem 0;
      padding: 0.5rem 1rem;
      color: #555;
    }
    ul.index { list-style: none; padding: 0; }
    ul.index li { margin: 0.5rem 0; }
    ul.index li a { font-size: 1.05rem; text-decoration: none; }
    ul.index li a:hover { text-decoration: underline; }
    hr { border: none; border-top: 1px solid #eee; margin: 2rem 0; }
  </style>
</head>
<body>
  ${nav}
  ${body}
</body>
</html>`;
}

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export interface DeploymentResult {
	url: string;
	id: string;
}

interface VercelFile {
	file: string;
	data: string;
}

export class VercelPublisher {
	constructor(
		private app: App,
		private settings: PublishMarkdownSettings
	) {}

	async publishFiles(files: TFile[]): Promise<DeploymentResult> {
		const deployFiles: VercelFile[] = [];
		const noteLinks: { slug: string; name: string }[] = [];

		for (const file of files) {
			const markdown = await this.app.vault.read(file);
			const processed = resolveWikilinks(markdown);
			const bodyHtml = await marked(processed);
			const slug = slugify(file.basename);

			deployFiles.push({
				file: `${slug}.html`,
				data: renderHtmlPage(file.basename, bodyHtml),
			});
			noteLinks.push({ slug, name: file.basename });
		}

		// Sort index alphabetically
		noteLinks.sort((a, b) => a.name.localeCompare(b.name));

		const indexBody = `
<h1>Notes</h1>
<ul class="index">
${noteLinks
	.map(
		(n) =>
			`  <li><a href="/${n.slug}.html">${escapeHtml(n.name)}</a></li>`
	)
	.join("\n")}
</ul>`;

		deployFiles.push({
			file: "index.html",
			data: renderHtmlPage("Notes", indexBody, true),
		});

		return this.deploy(deployFiles);
	}

	private async deploy(files: VercelFile[]): Promise<DeploymentResult> {
		const teamParam = this.settings.teamId
			? `?teamId=${encodeURIComponent(this.settings.teamId)}`
			: "";

		const response = await requestUrl({
			url: `https://api.vercel.com/v13/deployments${teamParam}`,
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.settings.apiToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				name: this.settings.projectName,
				files,
				target: "production",
				projectSettings: { framework: null },
			}),
			throw: false,
		});

		interface VercelResponse {
			url: string;
			id: string;
			error?: { message?: string };
		}
		const data = response.json as VercelResponse;

		if (response.status < 200 || response.status >= 300) {
			throw new Error(
				data.error?.message ?? `Vercel API error: ${response.status}`
			);
		}

		return { url: data.url, id: data.id };
	}
}
