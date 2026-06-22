import { App, TFile, requestUrl } from "obsidian";
import { buildRequestHeaders, type RequestOptions } from "./http-utils";
import { createDebugLogger, describeHeaders } from "./log";

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/jpg": "jpg",
	"image/webp": "webp",
	"image/gif": "gif",
	"image/svg+xml": "svg",
	"image/avif": "avif",
	"image/bmp": "bmp",
};

export const extensionFromUrl = (url: string): string | null => {
	try {
		const pathname = new URL(url).pathname;
		const match = pathname.match(/\.([a-z0-9]+)$/i);
		return match ? match[1].toLowerCase() : null;
	} catch {
		return null;
	}
};

/**
 * Download `imageUrl` into the vault's attachment folder and record the saved
 * image as a wikilink in the note's frontmatter under `imageKey`.
 */
export async function saveImageToNote(
	app: App,
	file: TFile,
	imageUrl: string,
	imageKey: string,
	options: RequestOptions,
	baseName: string,
): Promise<void> {
	const log = createDebugLogger(options.debug);
	const headers = buildRequestHeaders(imageUrl, options);
	log("Downloading image", imageUrl, "headers:", describeHeaders(headers));

	const response = await requestUrl({
		url: imageUrl,
		method: "GET",
		headers,
	});

	const contentType = (response.headers["content-type"] ?? "")
		.split(";")[0]
		.trim()
		.toLowerCase();
	const ext =
		CONTENT_TYPE_EXTENSIONS[contentType] ?? extensionFromUrl(imageUrl) ?? "png";
	log(
		"Download response",
		"status:",
		response.status,
		"content-type:",
		contentType || "(none)",
		"bytes:",
		response.arrayBuffer.byteLength,
		"ext:",
		ext,
	);

	const path = await app.fileManager.getAvailablePathForAttachment(
		`${baseName}.${ext}`,
		file.path,
	);

	const created = await app.vault.createBinary(path, response.arrayBuffer);

	await app.fileManager.processFrontMatter(file, (frontmatter) => {
		frontmatter[imageKey] = `[[${created.name}]]`;
	});
	log("Saved attachment", created.path, "→ frontmatter", imageKey);
}
