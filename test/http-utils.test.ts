import { describe, expect, it } from "bun:test";
import {
	bestFromImg,
	bestFromSrcset,
	buildRequestHeaders,
	isInstagramHost,
	type RequestOptions,
} from "../src/utils/http-utils";

/** Build a fake <img> element exposing only the `getAttribute` used by the code. */
const el = (attrs: Record<string, string>) =>
	({ getAttribute: (n: string) => attrs[n] ?? null }) as unknown as Element;

const options = (overrides: Partial<RequestOptions> = {}): RequestOptions => ({
	instagramCookie: "",
	userAgent: "",
	debug: false,
	...overrides,
});

describe("isInstagramHost", () => {
	it("matches Instagram and its image CDNs", () => {
		expect(isInstagramHost("https://instagram.com/p/abc")).toBe(true);
		expect(isInstagramHost("https://www.instagram.com/p/abc")).toBe(true);
		expect(isInstagramHost("https://scontent.cdninstagram.com/x.jpg")).toBe(
			true,
		);
		expect(isInstagramHost("https://scontent-lax3-1.fbcdn.net/x.jpg")).toBe(
			true,
		);
	});

	it("rejects non-Instagram and malformed URLs", () => {
		expect(isInstagramHost("https://example.com")).toBe(false);
		expect(isInstagramHost("https://instagrams.com")).toBe(false);
		expect(isInstagramHost("not a url")).toBe(false);
		expect(isInstagramHost("")).toBe(false);
	});
});

describe("buildRequestHeaders", () => {
	it("attaches the cookie and User-Agent for Instagram requests", () => {
		const headers = buildRequestHeaders(
			"https://www.instagram.com/p/abc",
			options({ instagramCookie: "sessionid=xyz", userAgent: "UA/1.0" }),
		);
		expect(headers["Cookie"]).toBe("sessionid=xyz");
		expect(headers["User-Agent"]).toBe("UA/1.0");
	});

	it("never leaks the cookie to non-Instagram hosts", () => {
		const headers = buildRequestHeaders(
			"https://example.com/page",
			options({ instagramCookie: "sessionid=xyz" }),
		);
		expect(headers["Cookie"]).toBe("");
	});

	it("clears the cookie when none is configured, even for Instagram", () => {
		const headers = buildRequestHeaders(
			"https://www.instagram.com/p/abc",
			options(),
		);
		expect(headers["Cookie"]).toBe("");
	});

	it("omits the User-Agent header when unset", () => {
		const headers = buildRequestHeaders("https://example.com", options());
		expect("User-Agent" in headers).toBe(false);
	});
});

describe("bestFromSrcset", () => {
	it("picks the largest width descriptor", () => {
		expect(
			bestFromSrcset("small.jpg 320w, medium.jpg 640w, large.jpg 1280w"),
		).toBe("large.jpg");
	});

	it("picks the largest pixel-density descriptor", () => {
		expect(bestFromSrcset("a.jpg 1x, b.jpg 2x, c.jpg 1.5x")).toBe("b.jpg");
	});

	it("falls back to the first entry when no descriptors are present", () => {
		expect(bestFromSrcset("only.jpg")).toBe("only.jpg");
	});

	it("returns null for an empty srcset", () => {
		expect(bestFromSrcset("")).toBeNull();
	});
});

describe("bestFromImg", () => {
	it("prefers srcset over src", () => {
		expect(
			bestFromImg(el({ srcset: "big.jpg 1280w", src: "small.jpg" })),
		).toBe("big.jpg");
	});

	it("uses data-srcset when srcset is absent", () => {
		expect(
			bestFromImg(el({ "data-srcset": "lazy.jpg 640w", src: "small.jpg" })),
		).toBe("lazy.jpg");
	});

	it("falls back through lazy-load attributes in order", () => {
		expect(bestFromImg(el({ src: "src.jpg" }))).toBe("src.jpg");
		expect(bestFromImg(el({ "data-src": "data-src.jpg" }))).toBe(
			"data-src.jpg",
		);
		expect(bestFromImg(el({ "data-original": "orig.jpg" }))).toBe("orig.jpg");
		expect(bestFromImg(el({ "data-lazy-src": "lazy.jpg" }))).toBe("lazy.jpg");
	});

	it("returns null when no usable attribute is present", () => {
		expect(bestFromImg(el({}))).toBeNull();
	});
});
