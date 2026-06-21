import { requestUrl } from "obsidian";

export const fetchImagesFromUrl = async (url: string): Promise<string[]> => {
	try {
		const response = await requestUrl({
			url,
			method: "GET",
			headers: {
				Cookie: "", // Clear any cookies
			},
		});

		const html = response.text;
		const parser = new DOMParser();
		const document = parser.parseFromString(html, "text/html");

		const candidates: string[] = [];

		// Open Graph / Twitter card images first — usually the best representation.
		document
			.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]')
			.forEach((meta) => {
				const content = meta.getAttribute("content");
				if (content) candidates.push(content);
			});

		// Then every <img> in the page body.
		document.querySelectorAll("img[src]").forEach((img) => {
			const src = img.getAttribute("src");
			if (src) candidates.push(src);
		});

		// Resolve relative URLs against the page URL, drop anything unparseable,
		// and dedupe while preserving order.
		const seen = new Set<string>();
		const images: string[] = [];
		for (const candidate of candidates) {
			try {
				const absolute = new URL(candidate, url).href;
				if (!seen.has(absolute)) {
					seen.add(absolute);
					images.push(absolute);
				}
			} catch {
				// Skip invalid URLs (e.g. malformed or empty src values).
			}
		}

		return images;
	} catch (error) {
		console.error(error);
		return [];
	}
};
