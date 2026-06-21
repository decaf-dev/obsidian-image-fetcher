import { App, Modal, Notice } from "obsidian";
import { createDebugLogger, type DebugLogger } from "../utils/log";
import type { RequestOptions } from "../utils/http-utils";

/** Persistent Electron session partition for the embedded browser. Keeping it
 * persistent means a manual login (when cookie injection isn't available) is
 * remembered across fetches. */
const IG_PARTITION = "persist:image-fetcher-instagram";

/**
 * In-page script: scroll the page to load lazily-rendered posts, then collect
 * every Instagram CDN image URL the browser actually rendered (skipping profile
 * avatars). Runs in the webview's page context and returns a string[].
 */
const COLLECT_SCRIPT = `(async () => {
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	// Only nudge the grid a few times to load the first couple of rows — enough
	// to pick from, without scrolling through the whole profile. Stops early if
	// the page stops growing. Jitter the scroll target and wait so the activity
	// looks less robotic.
	let last = -1;
	for (let i = 0; i < 4; i++) {
		const offset = Math.floor(Math.random() * 200) - 100; // -100..+100 px
		window.scrollTo(0, document.body.scrollHeight + offset);
		await sleep(1500 + Math.floor(Math.random() * 1500)); // 1500–3000 ms
		const h = document.body.scrollHeight;
		if (h === last) break;
		last = h;
	}
	window.scrollTo(0, 0);
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
	private onComplete: (images: string[]) => void;
	private log: DebugLogger;
	private webview: any = null;
	private done = false;

	constructor(
		app: App,
		url: string,
		options: RequestOptions,
		onComplete: (images: string[]) => void,
	) {
		super(app);
		this.url = url;
		this.options = options;
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

		wv.addEventListener("dom-ready", () => {
			collectBtn.disabled = false;
			status.setText('Ready. Scroll to load more, then click "Collect images".');
		});

		collectBtn.onclick = async () => {
			collectBtn.disabled = true;
			status.setText("Scrolling & collecting images…");
			try {
				const images: string[] = await wv.executeJavaScript(
					COLLECT_SCRIPT,
					false,
				);
				this.log("browser collected images:", images?.length ?? 0);
				this.finish(images ?? []);
			} catch (error) {
				this.log("collect failed", error);
				console.error(error);
				new Notice("Failed to collect images from the page");
				collectBtn.disabled = false;
				status.setText("Failed. Try again.");
			}
		};
	}

	private finish(images: string[]) {
		if (this.done) return;
		this.done = true;
		this.onComplete(images);
		this.close();
	}

	onClose() {
		if (!this.done) {
			this.done = true;
			this.onComplete([]); // closed without collecting
		}
		this.webview = null;
		this.contentEl.empty();
	}
}
