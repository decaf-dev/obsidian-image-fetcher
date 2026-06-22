import { App, Modal, Notice } from "obsidian";
import { createDebugLogger, type DebugLogger } from "../utils/log";
import type { RequestOptions } from "../utils/http-utils";

/** Persistent Electron session partition for the embedded browser. Keeping it
 * persistent means a manual login (when cookie injection isn't available) is
 * remembered across fetches. */
const IG_PARTITION = "persist:image-fetcher-instagram";

/**
 * In-page collector, injected once per page load. Instagram virtualizes its
 * grid — images scrolled off-screen are unmounted from the DOM — so scraping
 * only at the end loses everything but the last screenful. Instead we scan the
 * DOM on an interval (and the scroll loop pokes it too), accumulating every
 * Instagram CDN image URL into a Set as it appears, before it gets unmounted.
 * Idempotent: re-running (e.g. on the next dom-ready) is a no-op.
 */
const INIT_COLLECTOR_SCRIPT = `(() => {
	if (window.__igCollector) return true;
	const seen = new Set();
	const scan = () => {
		for (const img of document.querySelectorAll("img")) {
			const src = img.currentSrc || img.src || "";
			if (!/cdninstagram|fbcdn/.test(src)) continue;
			const alt = (img.getAttribute("alt") || "").toLowerCase();
			if (alt.includes("profile picture")) continue;
			seen.add(src);
		}
	};
	scan();
	const interval = setInterval(scan, 400);
	window.__igCollector = { seen, scan, interval };
	return true;
})();`;

/** Expression returning how many images the collector has accumulated so far. */
const COLLECTOR_COUNT_SCRIPT = `window.__igCollector ? window.__igCollector.seen.size : 0`;

/**
 * Build the in-page collection script. When `scrollCount > 0` it first nudges
 * the grid that many times to load lazily-rendered posts (stopping early if the
 * page stops growing), letting the collector accumulate each new screenful;
 * when `scrollCount === 0` it just returns whatever has accumulated so far from
 * the user's own scrolling/clicking. Returns the full accumulated Set (falling
 * back to a one-shot DOM scan if the collector failed to initialize).
 */
const buildCollectScript = (scrollCount: number): string => `(async () => {
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	const scrollCount = ${Math.max(0, Math.floor(scrollCount))};
	const collector = window.__igCollector;
	// Nudge the grid to load more rows. Stops early if the page stops growing.
	// Jitter the scroll target and wait so the activity looks less robotic.
	let last = -1;
	for (let i = 0; i < scrollCount; i++) {
		const offset = Math.floor(Math.random() * 200) - 100; // -100..+100 px
		window.scrollTo(0, document.body.scrollHeight + offset);
		await sleep(1500 + Math.floor(Math.random() * 1500)); // 1500–3000 ms
		if (collector) collector.scan();
		const h = document.body.scrollHeight;
		if (h === last) break;
		last = h;
	}
	if (scrollCount > 0) window.scrollTo(0, 0);
	if (collector) {
		collector.scan();
		return Array.from(collector.seen);
	}
	const urls = [];
	const seen = new Set();
	for (const img of Array.from(document.querySelectorAll("img"))) {
		const src = img.currentSrc || img.src || "";
		if (!/cdninstagram|fbcdn/.test(src)) continue;
		const alt = (img.getAttribute("alt") || "").toLowerCase();
		if (alt.includes("profile picture")) continue;
		if (seen.has(src)) continue;
		seen.add(src);
		urls.push(src);
	}
	return urls;
})();`;

/** Best-effort handle to Electron's remote module, which exposes the session API
 * in the renderer. Returns null when it isn't reachable (older/locked-down
 * Electron) — the modal then falls back to interactive login. */
const getElectronRemote = (): any | null => {
	try {
		return require("@electron/remote");
	} catch {
		/* not available; try the legacy location */
	}
	try {
		return (require("electron") as any).remote ?? null;
	} catch {
		return null;
	}
};

/** Inject the saved cookie string into the partition's cookie jar so the
 * embedded browser loads already authenticated (handles httpOnly `sessionid`,
 * which `document.cookie` cannot set). */
const seedCookies = async (
	session: any,
	cookie: string,
	log: DebugLogger,
): Promise<void> => {
	for (const pair of cookie.split(";")) {
		const eq = pair.indexOf("=");
		if (eq === -1) continue;
		const name = pair.slice(0, eq).trim();
		const value = pair.slice(eq + 1).trim();
		if (!name) continue;
		try {
			await session.cookies.set({
				url: "https://www.instagram.com",
				name,
				value,
				domain: ".instagram.com",
				path: "/",
				secure: true,
				httpOnly: name === "sessionid",
			});
		} catch (error) {
			log("cookie set failed for", name, error);
		}
	}
};

/**
 * Renders a URL in an embedded Electron browser so JavaScript-driven pages
 * (e.g. an Instagram profile grid) actually load, then scrolls and scrapes the
 * rendered image URLs. Resolves the collected URLs via `onComplete` ([] if the
 * user closes without collecting).
 */
export class BrowserFetchModal extends Modal {
	private url: string;
	private options: RequestOptions;
	private scrollCount: number;
	private onComplete: (images: string[]) => void;
	private log: DebugLogger;
	private webview: any = null;
	private done = false;
	private countPoll: number | null = null;

	constructor(
		app: App,
		url: string,
		options: RequestOptions,
		scrollCount: number,
		onComplete: (images: string[]) => void,
	) {
		super(app);
		this.url = url;
		this.options = options;
		this.scrollCount = scrollCount;
		this.onComplete = onComplete;
		this.log = createDebugLogger(options.debug);
	}

	async onOpen() {
		const { contentEl, modalEl } = this;
		modalEl.style.width = "960px";
		modalEl.style.maxWidth = "95vw";
		modalEl.style.height = "85vh";
		contentEl.style.display = "flex";
		contentEl.style.flexDirection = "column";
		contentEl.style.height = "100%";

		const bar = contentEl.createDiv();
		bar.style.display = "flex";
		bar.style.alignItems = "center";
		bar.style.gap = "12px";
		bar.style.marginBottom = "8px";

		const collectBtn = bar.createEl("button", {
			text: "Collect images",
			cls: "mod-cta",
		});
		collectBtn.disabled = true;
		const collectLoadedBtn = bar.createEl("button", {
			text: "Collect loaded (no scroll)",
		});
		collectLoadedBtn.disabled = true;
		const status = bar.createEl("span", {
			text: "Loading… log in if prompted, then click Collect images.",
		});
		status.style.color = "var(--text-muted)";

		// Inject the saved cookie so the page loads authenticated when possible;
		// otherwise the user logs in inside the webview (session persists).
		const remote = getElectronRemote();
		const session = remote?.session?.fromPartition?.(IG_PARTITION) ?? null;
		if (session && this.options.instagramCookie) {
			await seedCookies(session, this.options.instagramCookie, this.log);
			this.log("seeded cookies into webview partition");
		} else {
			this.log(
				"no electron session for cookie injection; using manual login",
				"(remote:",
				!!remote,
				")",
			);
		}

		const wv = document.createElement("webview") as any;
		this.webview = wv;
		wv.setAttribute("partition", IG_PARTITION);
		if (this.options.userAgent) wv.setAttribute("useragent", this.options.userAgent);
		wv.setAttribute("allowpopups", "true");
		wv.setAttribute("src", this.url);
		wv.style.flex = "1";
		wv.style.width = "100%";
		wv.style.border = "1px solid var(--background-modifier-border)";
		contentEl.appendChild(wv);

		wv.addEventListener("dom-ready", async () => {
			// Install the accumulating collector so images are captured as they
			// scroll into view, before Instagram unmounts them from the DOM.
			try {
				await wv.executeJavaScript(INIT_COLLECTOR_SCRIPT, false);
			} catch (error) {
				this.log("collector init failed", error);
			}
			collectBtn.disabled = false;
			collectLoadedBtn.disabled = false;
			status.setText(
				'Ready. Scroll/click to load images, then click "Collect".',
			);

			// Poll the running tally so the user can watch it climb as they scroll.
			if (this.countPoll == null) {
				this.countPoll = window.setInterval(async () => {
					if (this.done) return;
					try {
						const n: number = await wv.executeJavaScript(
							COLLECTOR_COUNT_SCRIPT,
							false,
						);
						status.setText(
							`${n} image${n === 1 ? "" : "s"} collected. Scroll/click to load more, then click "Collect".`,
						);
					} catch {
						/* page navigating or not ready; ignore this tick */
					}
				}, 1000);
			}
		});

		const buttons = [collectBtn, collectLoadedBtn];
		const runCollect = async (scrollCount: number) => {
			if (this.countPoll != null) {
				clearInterval(this.countPoll);
				this.countPoll = null;
			}
			buttons.forEach((b) => (b.disabled = true));
			status.setText(
				scrollCount > 0
					? "Scrolling & collecting images…"
					: "Collecting loaded images…",
			);
			try {
				const images: string[] = await wv.executeJavaScript(
					buildCollectScript(scrollCount),
					false,
				);
				this.log(
					"browser collected images:",
					images?.length ?? 0,
					"scrolls:",
					scrollCount,
				);
				this.finish(images ?? []);
			} catch (error) {
				this.log("collect failed", error);
				console.error(error);
				new Notice("Failed to collect images from the page");
				buttons.forEach((b) => (b.disabled = false));
				status.setText("Failed. Try again.");
			}
		};

		collectBtn.onclick = () => runCollect(this.scrollCount);
		collectLoadedBtn.onclick = () => runCollect(0);
	}

	private finish(images: string[]) {
		if (this.done) return;
		this.done = true;
		this.onComplete(images);
		this.close();
	}

	onClose() {
		if (this.countPoll != null) {
			clearInterval(this.countPoll);
			this.countPoll = null;
		}
		if (!this.done) {
			this.done = true;
			this.onComplete([]); // closed without collecting
		}
		this.webview = null;
		this.contentEl.empty();
	}
}
