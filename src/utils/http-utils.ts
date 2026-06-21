import { requestUrl } from "obsidian";
import { createDebugLogger, describeHeaders, type DebugLogger } from "./log";

/** Per-request options threaded from plugin settings. */
export interface RequestOptions {
	instagramCookie: string;
	userAgent: string;
	debug: boolean;
}

const INSTAGRAM_HOSTS = ["instagram.com", "cdninstagram.com", "fbcdn.net"];

/** Whether `url` points at Instagram or its image CDNs. */
const isInstagramHost = (url: string): boolean => {
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

/** Decode JSON string escapes that appear in Instagram's embedded data. */
const unescapeJson = (value: string): string =>
	value.replace(/\\u0026/g, "&").replace(/\\\//g, "/");

/** Stable per-image key from an Instagram CDN filename (e.g. `..._n.jpg`), used
 * to dedupe the same photo across resolutions/signing params. */
const instagramImageKey = (url: string): string =>
	url.match(/\/(\d+_\d+_\d+_[a-z])\./i)?.[1] ?? url;

/**
 * Extract every post image from Instagram's embedded JSON in the page HTML —
 * including all carousel slides, which the `og:image` tag (cover only) misses.
 * Reads `display_url` and `image_versions2` candidates, dedupes per photo
 * keeping the first (largest) URL seen. Returns [] if nothing matches.
 */
export const extractInstagramImages = (html: string): string[] => {
	const raw: string[] = [];
	const strVal = `"(https:[^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`;
	// One display_url per media item / carousel child (highest-res web image).
	for (const m of html.matchAll(new RegExp(`"display_url":${strVal}`, "g"))) {
		raw.push(unescapeJson(m[1]));
	}
	// First (largest) candidate of each image_versions2 block — covers the REST
	// shape used for carousels that has no display_url per child.
	for (const m of html.matchAll(
		new RegExp(`"image_versions2":\\{"candidates":\\[\\{[^}]*?"url":${strVal}`, "g"),
	)) {
		raw.push(unescapeJson(m[1]));
	}

	const seen = new Set<string>();
	const images: string[] = [];
	for (const url of raw) {
		const key = instagramImageKey(url);
		if (!seen.has(key)) {
			seen.add(key);
			images.push(url);
		}
	}
	return images;
};

const IG_SHORTCODE_ALPHABET =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Shortcode from an Instagram post/reel URL, e.g. `/p/<code>/`. */
const instagramShortcode = (url: string): string | null =>
	url.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/)?.[1] ?? null;

/**
 * Decode an Instagram shortcode to its numeric media id. The shortcode is a
 * base-64 (IG alphabet) encoding of the id; we convert to decimal with
 * big-number arithmetic since the id exceeds Number.MAX_SAFE_INTEGER.
 */
const shortcodeToMediaId = (shortcode: string): string | null => {
	const digits = [0]; // decimal value, least-significant digit first
	for (const ch of shortcode) {
		const value = IG_SHORTCODE_ALPHABET.indexOf(ch);
		if (value === -1) return null;
		let carry = value;
		for (let i = 0; i < digits.length; i++) {
			const cur = digits[i] * 64 + carry;
			digits[i] = cur % 10;
			carry = Math.floor(cur / 10);
		}
		while (carry > 0) {
			digits.push(carry % 10);
			carry = Math.floor(carry / 10);
		}
	}
	return digits.reverse().join("");
};

/** Largest (first) candidate URL from an `image_versions2` block. */
const largestCandidate = (versions: {
	candidates?: Array<{ url?: string }>;
}): string | null => versions?.candidates?.[0]?.url ?? null;

/** Collect post image URLs (every carousel slide) from a media-API item. */
const imagesFromMediaItem = (item: {
	carousel_media?: unknown[];
	image_versions2?: { candidates?: Array<{ url?: string }> };
}): string[] => {
	const children = Array.isArray(item?.carousel_media)
		? (item.carousel_media as Array<{
				image_versions2?: { candidates?: Array<{ url?: string }> };
			}>)
		: [item];
	const urls: string[] = [];
	for (const child of children) {
		const url = largestCandidate(child?.image_versions2 ?? {});
		if (url) urls.push(url);
	}
	return urls;
};

/**
 * Fetch a post's images from Instagram's media-info API. Modern Instagram loads
 * carousel data client-side, so it is not present in the page HTML — this hits
 * the same endpoint the web app uses and returns every slide at full res.
 * Returns [] when the URL is not a post, the id cannot be decoded, or the
 * request fails (the caller then falls back to HTML scraping).
 */
const fetchInstagramApiImages = async (
	url: string,
	options: RequestOptions,
	log: DebugLogger,
): Promise<string[]> => {
	const shortcode = instagramShortcode(url);
	if (!shortcode) return [];
	const mediaId = shortcodeToMediaId(shortcode);
	if (!mediaId) return [];

	const apiUrl = `https://www.instagram.com/api/v1/media/${mediaId}/info/`;
	const headers = buildRequestHeaders(apiUrl, options);
	headers["X-ASBD-ID"] = "129477";
	headers["X-Requested-With"] = "XMLHttpRequest";

	const response = await requestUrl({
		url: apiUrl,
		method: "GET",
		headers,
		throw: false,
	});
	log("Instagram media API", "media id:", mediaId, "status:", response.status);
	if (response.status !== 200) return [];

	try {
		const item = response.json?.items?.[0];
		const images = item ? imagesFromMediaItem(item) : [];
		log("Instagram media API images:", images.length, images);
		return images;
	} catch (error) {
		log("Instagram media API parse failed", error);
		return [];
	}
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

		// Diagnose whether the page came back authenticated. Instagram embeds
		// signals like `"is_logged_in":true` / the viewer's id+username when the
		// cookie is honored; a login wall means the cookie was rejected/missing.
		const looksLikeLogin =
			/\/accounts\/login|"viewerId":null|"viewer_id":null|loginForm/i.test(
				html,
			);
		const authSignals = [
			...new Set(
				html.match(
					/"is_logged_in":\s*(?:true|false)|"viewer(?:_id|Id)?":\s*(?:null|"\d+")|"viewer":\s*null/g,
				) ?? [],
			),
		].slice(0, 6);
		const ogImage = document
			.querySelector('meta[property="og:image"]')
			?.getAttribute("content");
		log(
			"Page title:",
			JSON.stringify(document.title),
			"| login wall:",
			looksLikeLogin,
		);
		log("Auth signals:", authSignals.length ? authSignals : "(none found)");
		log("og:image:", ogImage ?? "(none)");

		const candidates: string[] = [];

		// Instagram: get every post image (all carousel slides), which the
		// og:image cover tag alone can't give us. Prefer the media-info API
		// (the carousel data isn't in the static HTML); fall back to any JSON
		// embedded in the page. When found, these fully replace the meta/<img>
		// scrape — og:image is a duplicate cover and the <img> tags are chrome.
		let igImages: string[] = [];
		if (isInstagramHost(url)) {
			igImages = await fetchInstagramApiImages(url, options, log);
			if (!igImages.length) igImages = extractInstagramImages(html);
		}
		if (igImages.length) {
			candidates.push(...igImages);
		} else {
			// Open Graph / Twitter card images first — usually the best
			// representation — then every <img> in the page body.
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
		}

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
