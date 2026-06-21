import { App, TFile, requestUrl } from "obsidian";

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

const extensionFromUrl = (url: string): string | null => {
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
 * path in the note's `image` frontmatter property.
 */
export async function saveImageToNote(
	app: App,
	file: TFile,
	imageUrl: string,
): Promise<void> {
	const response = await requestUrl({ url: imageUrl, method: "GET" });

	const contentType = (response.headers["content-type"] ?? "")
		.split(";")[0]
		.trim()
		.toLowerCase();
	const ext =
		CONTENT_TYPE_EXTENSIONS[contentType] ?? extensionFromUrl(imageUrl) ?? "png";

	const path = await app.fileManager.getAvailablePathForAttachment(
		`${file.basename}-image.${ext}`,
		file.path,
	);

	await app.vault.createBinary(path, response.arrayBuffer);

	await app.fileManager.processFrontMatter(file, (frontmatter) => {
		frontmatter.image = path;
	});
}
