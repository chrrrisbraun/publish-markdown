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

// Slugify a filename while preserving its extension
function slugifyFilename(filename: string): string {
	const dot = filename.lastIndexOf(".");
	if (dot === -1) return slugify(filename);
	return slugify(filename.slice(0, dot)) + filename.slice(dot).toLowerCase();
}

// Convert an ArrayBuffer to a base64 string
function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	const chunks: string[] = [];
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		chunks.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
	}
	return btoa(chunks.join(""));
}

// Replace Obsidian ![[image]] embeds with standard <img> tags pointing to the deployed path
function resolveImageEmbeds(markdown: string): string {
	return markdown.replace(
		/!\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g,
		(_, filename: string, alt?: string) => {
			const name = filename.trim().split("/").pop() ?? filename.trim();
			const slug = slugifyFilename(name);
			const altText = alt?.trim() ?? name;
			return `![${altText}](/${slug})`;
		}
	);
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
    img { max-width: 100%; height: auto; border-radius: 4px; }
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
	encoding?: "base64";
}

export class VercelPublisher {
	constructor(
		private app: App,
		private settings: PublishMarkdownSettings
	) {}

	async publishFiles(files: TFile[]): Promise<DeploymentResult> {
		const deployFiles: VercelFile[] = [];
		const noteLinks: { slug: string; name: string }[] = [];

		// Collect all image files referenced across the notes
		const images = await this.collectImages(files);

		// Read each image and add as a base64-encoded file
		for (const [slug, imageFile] of images) {
			const binary = await this.app.vault.readBinary(imageFile);
			deployFiles.push({
				file: slug,
				data: arrayBufferToBase64(binary),
				encoding: "base64",
			});
		}

		// Convert each note to HTML
		for (const file of files) {
			const markdown = await this.app.vault.read(file);
			const withImages = resolveImageEmbeds(markdown);
			const withLinks = resolveWikilinks(withImages);
			const bodyHtml = await marked(withLinks);
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

	// Find all ![[image]] embeds in the given notes and resolve them to vault files
	private async collectImages(files: TFile[]): Promise<Map<string, TFile>> {
		const images = new Map<string, TFile>();
		const embedRegex = /!\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g;

		for (const file of files) {
			const markdown = await this.app.vault.read(file);
			let match: RegExpExecArray | null;
			embedRegex.lastIndex = 0;
			while ((match = embedRegex.exec(markdown)) !== null) {
				const linkpath = match[1]?.trim();
				if (!linkpath) continue;
				const imageFile = this.app.metadataCache.getFirstLinkpathDest(linkpath, file.path);
				if (imageFile) {
					const slug = slugifyFilename(imageFile.name);
					if (!images.has(slug)) {
						images.set(slug, imageFile);
					}
				}
			}
		}

		return images;
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
		const data = response.json as VercelResponse | undefined;

		if (response.status < 200 || response.status >= 300) {
			throw new Error(
				data?.error?.message ?? `Vercel API error: ${response.status}`
			);
		}

		if (!data) throw new Error("Empty response from Vercel API");
		return { url: data.url, id: data.id };
	}
}
