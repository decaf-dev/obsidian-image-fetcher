import { describe, expect, it } from "bun:test";
import { extensionFromUrl } from "../src/utils/save-image";

describe("extensionFromUrl", () => {
	it("extracts and lowercases the extension", () => {
		expect(extensionFromUrl("https://example.com/photo.PNG")).toBe("png");
		expect(extensionFromUrl("https://example.com/a/b/c.jpeg")).toBe("jpeg");
	});

	it("ignores query strings and fragments", () => {
		expect(extensionFromUrl("https://example.com/a.jpg?v=2")).toBe("jpg");
		expect(extensionFromUrl("https://example.com/a.webp#frag")).toBe("webp");
	});

	it("returns null when there is no extension", () => {
		expect(extensionFromUrl("https://example.com/image")).toBeNull();
		expect(extensionFromUrl("https://example.com/")).toBeNull();
	});

	it("returns null for malformed URLs", () => {
		expect(extensionFromUrl("not a url")).toBeNull();
	});
});
