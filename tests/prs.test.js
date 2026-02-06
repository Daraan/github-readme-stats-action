import { jest, test, expect, describe } from "@jest/globals";

// Re-implement / import the pure helpers from prs.js for testing.
// prs.js has side-effect-free exports so we can import directly.
import {
  resolveColors,
  languageIconUrl,
  escapeXml,
  renderOrgCard,
  fetchUserPRs,
  LANG_ICON_SLUGS,
  parseExcludeList,
  shouldExcludeRepo,
  getRepoShortName,
  resolveOrgDisplayName,
} from "../prs.js";

describe("escapeXml", () => {
  test("escapes special XML characters", () => {
    expect(escapeXml("a & b < c > d \" e ' f")).toBe(
      "a &amp; b &lt; c &gt; d &quot; e &#39; f",
    );
  });

  test("returns plain text unchanged", () => {
    expect(escapeXml("hello")).toBe("hello");
  });
});

describe("languageIconUrl", () => {
  test("returns devicon URL for known language", () => {
    expect(languageIconUrl("Python")).toBe(
      "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/python/python-original.svg",
    );
  });

  test("returns null for unknown language", () => {
    expect(languageIconUrl("Brainfuck++")).toBeNull();
  });

  test("all LANG_ICON_SLUGS produce valid URLs", () => {
    for (const [lang, slug] of Object.entries(LANG_ICON_SLUGS)) {
      const url = languageIconUrl(lang);
      expect(url).not.toBeNull();
      expect(url).toContain(slug);
    }
  });
});

describe("resolveColors", () => {
  test("returns default theme colors when no options provided", () => {
    const c = resolveColors({});
    expect(c.titleColor).toBe("#2f80ed");
    expect(c.bgColor).toBe("#fffefe");
  });

  test("applies named theme", () => {
    const c = resolveColors({ theme: "dark" });
    expect(c.titleColor).toBe("#fff");
    expect(c.bgColor).toBe("#151515");
  });

  test("user color overrides take precedence", () => {
    const c = resolveColors({ theme: "dark", title_color: "ff0000" });
    expect(c.titleColor).toBe("#ff0000");
    // other colors still from theme
    expect(c.bgColor).toBe("#151515");
  });

  test("falls back to default for unknown theme", () => {
    const c = resolveColors({ theme: "nonexistent_xyz" });
    expect(c.titleColor).toBe("#2f80ed");
  });
});

describe("renderOrgCard", () => {
  const sampleData = {
    org: "python",
    orgDisplayName: "Python",
    avatarUrl: "https://avatars.githubusercontent.com/u/1525981",
    repo: "python/cpython",
    stars: 65000,
    mergedPRs: 12,
    language: "Python",
  };

  // Mock global fetch to avoid real network calls in tests.
  const originalFetch = globalThis.fetch;

  beforeAll(() => {
    globalThis.fetch = jest.fn(async (url) => ({
      ok: true,
      status: 200,
      headers: { get: () => "image/png" },
      arrayBuffer: async () => new ArrayBuffer(8),
    }));
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  test("produces valid SVG with expected content", async () => {
    const svg = await renderOrgCard(sampleData, {}, {});
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("Python");
    expect(svg).toContain("12 merged");
    expect(svg).toContain("65.0k"); // formatted star count
  });

  test("includes org name in card title", async () => {
    const svg = await renderOrgCard(sampleData, {}, {});
    expect(svg).toContain("Python PR Card");
  });

  test("applies theme colors", async () => {
    const svg = await renderOrgCard(sampleData, { theme: "dark" }, {});
    expect(svg).toContain("#151515"); // dark bg
    expect(svg).toContain("#fff"); // dark title
  });

  test("respects hide_border option", async () => {
    const svg = await renderOrgCard(sampleData, { hide_border: "true" }, {});
    expect(svg).toContain('stroke-opacity="0"');
  });

  test("handles missing language gracefully", async () => {
    const data = { ...sampleData, language: "" };
    const svg = await renderOrgCard(data, {}, {});
    expect(svg).toContain("<svg");
    expect(svg).not.toContain("undefined");
  });

  test("star count < 1000 not formatted with k", async () => {
    const data = { ...sampleData, stars: 500 };
    const svg = await renderOrgCard(data, {}, {});
    expect(svg).toContain(">500<");
  });

  test("gracefully handles fetch failure for avatar", async () => {
    const savedFetch = globalThis.fetch;
    globalThis.fetch = jest.fn(async () => ({
      ok: false,
      status: 404,
      headers: { get: () => "image/png" },
    }));
    const svg = await renderOrgCard(sampleData, {}, {});
    expect(svg).toContain("<svg");
    expect(svg).not.toContain("undefined");
    globalThis.fetch = savedFetch;
  });
});

describe("fetchUserPRs", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("includes non-fork user repos but skips forked ones", async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        data: {
          search: {
            nodes: [
              {
                id: "pr-1",
                repository: {
                  nameWithOwner: "octo/hello-world",
                  isFork: false,
                  owner: {
                    __typename: "User",
                    login: "octo",
                    avatarUrl: "https://avatars.githubusercontent.com/u/1",
                    name: "Octo",
                  },
                  stargazerCount: 120,
                  primaryLanguage: { name: "JavaScript" },
                },
              },
              {
                id: "pr-2",
                repository: {
                  nameWithOwner: "octo/hello-world",
                  isFork: false,
                  owner: {
                    __typename: "User",
                    login: "octo",
                    avatarUrl: "https://avatars.githubusercontent.com/u/1",
                    name: "Octo",
                  },
                  stargazerCount: 120,
                  primaryLanguage: { name: "JavaScript" },
                },
              },
              {
                id: "pr-3",
                repository: {
                  nameWithOwner: "octo/forked",
                  isFork: true,
                  owner: {
                    __typename: "User",
                    login: "octo",
                    avatarUrl: "https://avatars.githubusercontent.com/u/1",
                    name: "Octo",
                  },
                  stargazerCount: 80,
                  primaryLanguage: { name: "TypeScript" },
                },
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }),
    }));

    const data = await fetchUserPRs("octo", "token");
    expect(data).toHaveLength(1);
    expect(data[0].org).toBe("octo");
    expect(data[0].repo).toBe("octo/hello-world");
    expect(data[0].mergedPRs).toBe(2);
    expect(data[0].orgDisplayName).toBe("hello-world");
  });
});

describe("exclude list helpers", () => {
  test("parseExcludeList normalizes comma-separated values", () => {
    expect(parseExcludeList("pydantic, foo , ,BAR")).toEqual([
      "pydantic",
      "foo",
      "bar",
    ]);
  });

  test("shouldExcludeRepo matches substrings", () => {
    const list = ["pydantic", "foo"];
    expect(shouldExcludeRepo("pydantic/pydantic-core", list)).toBe(true);
    expect(shouldExcludeRepo("foo/bar", list)).toBe(true);
    expect(shouldExcludeRepo("python/cpython", list)).toBe(false);
  });
});

describe("resolveOrgDisplayName", () => {
  test("keeps organization display name", () => {
    expect(
      resolveOrgDisplayName(
        "Organization",
        "Python",
        "python/typing_extensions",
      ),
    ).toBe("Python");
  });

  test("uses repo name for user-owned repos", () => {
    expect(
      resolveOrgDisplayName(
        "User",
        "swansonk14",
        "swansonk14/typed-argument-parser",
      ),
    ).toBe("typed-argument-parser");
  });
});

describe("getRepoShortName", () => {
  test("returns repo name without owner prefix", () => {
    expect(getRepoShortName("python/cpython")).toBe("cpython");
  });
});
