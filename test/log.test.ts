import { describe, expect, it, spyOn } from "bun:test";
import { createDebugLogger, describeHeaders } from "../src/utils/log";

describe("describeHeaders", () => {
	it("reports an attached cookie by length without leaking its value", () => {
		const cookie = "sessionid=supersecretvalue";
		const result = describeHeaders({ Cookie: cookie });
		expect(result.cookie).toBe(`attached (${cookie.length} chars)`);
		expect(result.cookie).not.toContain("supersecret");
	});

	it("reports a missing cookie as none", () => {
		expect(describeHeaders({}).cookie).toBe("none");
		expect(describeHeaders({ Cookie: "" }).cookie).toBe("none");
	});

	it("reports User-Agent presence as set/none", () => {
		expect(describeHeaders({ "User-Agent": "Mozilla/5.0" }).userAgent).toBe(
			"set",
		);
		expect(describeHeaders({}).userAgent).toBe("none");
	});
});

describe("createDebugLogger", () => {
	it("logs with the [image-fetcher] prefix when debug is enabled", () => {
		const spy = spyOn(console, "log").mockImplementation(() => {});
		try {
			createDebugLogger(true)("hello", 42);
			expect(spy).toHaveBeenCalledWith("[image-fetcher]", "hello", 42);
		} finally {
			spy.mockRestore();
		}
	});

	it("is a no-op when debug is disabled", () => {
		const spy = spyOn(console, "log").mockImplementation(() => {});
		try {
			createDebugLogger(false)("hello");
			expect(spy).not.toHaveBeenCalled();
		} finally {
			spy.mockRestore();
		}
	});
});
