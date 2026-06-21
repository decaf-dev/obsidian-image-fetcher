import { mock } from "bun:test";

// `obsidian` is a types-only package (empty `main`), so Bun cannot resolve it
// at runtime. The functions under test never call into Obsidian, but importing
// their modules pulls in `import { … } from "obsidian"` — stub it out.
mock.module("obsidian", () => ({
	requestUrl: () => {},
	App: class {},
	TFile: class {},
}));
