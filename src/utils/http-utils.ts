import { requestUrl } from "obsidian";

/**
 * Pick the highest-resolution URL from a `srcset` value. Entries are scored by
 * their width (`640w`) or pixel-density (`2x`) descriptor; the largest wins.
 */
const bestFromSrcset = (srcset: string): string | null => {
	let best: { url: string; score: number } | null = null;
	for (const entry of srcset.split(",")) {
		const [rawUrl, descriptor] = entry.trim().split(/\s+/);
		if (!rawUrl) continue;

		let score = 1;
		const width = descriptor?.match(/^(\d+)w$/);
		const density = descriptor?.match(/^([\d.]+)x$/);
		if (width) score = parseInt(width[1], 10);
		else if (density) score = parseFloat(density[1]) * 1000;

		if (!best || score > best.score) best = { url: rawUrl, score };
	}
	return best?.url ?? null;
};

/**
 * Resolve an <img> to its full-size source, preferring the largest `srcset`
 * candidate and falling back through common lazy-load attributes.
 */
const bestFromImg = (img: Element): string | null => {
	const srcset =
		img.getAttribute("srcset") ?? img.getAttribute("data-srcset");
	if (srcset) {
		const best = bestFromSrcset(srcset);
		if (best) return best;
	}
	return (
		img.getAttribute("src") ??
		img.getAttribute("data-src") ??
		img.getAttribute("data-original") ??
		img.getAttribute("data-lazy-src")
	);
};

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

		// Then every <img> in the page body, resolved to its full-size source.
		document.querySelectorAll("img").forEach((img) => {
			const src = bestFromImg(img);
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
