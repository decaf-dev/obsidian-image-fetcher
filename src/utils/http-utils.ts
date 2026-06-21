import { requestUrl } from "obsidian";
import { createDebugLogger, describeHeaders } from "./log";

/** Per-request options threaded from plugin settings. */
export interface RequestOptions {
	instagramCookie: string;
	userAgent: string;
	debug: boolean;
}

const INSTAGRAM_HOSTS = ["instagram.com", "cdninstagram.com", "fbcdn.net"];

/** Whether `url` points at Instagram or its image CDNs. */
export const isInstagramHost = (url: string): boolean => {
	try {
		const host = new URL(url).hostname;
		return INSTAGRAM_HOSTS.some((h) => host === h || host.endsWith("." + h));
	} catch {
		return false;
	}
};

/**
 * Build request headers for a fetch/download. The Instagram cookie is attached
 * ONLY when the target host is Instagram — never leak the session to other
 * sites; non-Instagram requests keep the existing clear-cookie behavior. The
 * User-Agent, when set, is sent on every request.
 */
export const buildRequestHeaders = (
	url: string,
	options: RequestOptions,
): Record<string, string> => {
	const headers: Record<string, string> = {};
	if (options.userAgent) headers["User-Agent"] = options.userAgent;
	headers["Cookie"] =
		options.instagramCookie && isInstagramHost(url)
			? options.instagramCookie
			: ""; // Clear any cookies for non-Instagram hosts
	return headers;
};

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

export const fetchImagesFromUrl = async (
	url: string,
	options: RequestOptions,
): Promise<string[]> => {
	const log = createDebugLogger(options.debug);
	try {
		const headers = buildRequestHeaders(url, options);
		log("Fetching page", url, "headers:", describeHeaders(headers));

		const response = await requestUrl({
			url,
			method: "GET",
			headers,
		});

		const html = response.text;
		log(
			"Page response",
			"status:",
			response.status,
			"html length:",
			html.length,
		);

		const parser = new DOMParser();
		const document = parser.parseFromString(html, "text/html");
		log("Page title:", JSON.stringify(document.title));

		// Open Graph / Twitter card images first — usually the best
		// representation — then every <img> in the page body.
		const candidates: string[] = [];
		document
			.querySelectorAll(
				'meta[property="og:image"], meta[name="twitter:image"]',
			)
			.forEach((meta) => {
				const content = meta.getAttribute("content");
				if (content) candidates.push(content);
			});
		document.querySelectorAll("img").forEach((img) => {
			const src = bestFromImg(img);
			if (src) candidates.push(src);
		});

		log("Candidates collected:", candidates.length);

		// Resolve relative URLs against the page URL, drop anything unparseable,
		// and dedupe while preserving order.
		const seen = new Set<string>();
		const images: string[] = [];
		for (const candidate of candidates) {
			if (candidate.startsWith("data:")) continue; // skip inline placeholders
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

		log("Resolved", images.length, "unique image URLs:", images);
		return images;
	} catch (error) {
		log("Fetch failed", error);
		console.error(error);
		return [];
	}
};
