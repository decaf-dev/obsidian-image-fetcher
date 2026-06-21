export type DebugLogger = (...args: unknown[]) => void;

/**
 * Returns a logger that prefixes messages with `[image-fetcher]` when `debug`
 * is enabled, and is a no-op otherwise. Output appears in Obsidian's DevTools
 * console (Ctrl/Cmd+Opt+I).
 */
export const createDebugLogger = (debug: boolean): DebugLogger =>
	debug
		? (...args: unknown[]) => console.log("[image-fetcher]", ...args)
		: () => {};

/**
 * Summarize request headers for logging WITHOUT leaking the cookie value —
 * only reports whether a cookie/User-Agent was attached.
 */
export const describeHeaders = (
	headers: Record<string, string>,
): Record<string, string> => {
	const cookie = headers["Cookie"];
	return {
		userAgent: headers["User-Agent"] ? "set" : "none",
		cookie: cookie ? `attached (${cookie.length} chars)` : "none",
	};
};
