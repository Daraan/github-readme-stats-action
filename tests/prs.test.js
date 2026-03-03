import {
  jest,
  test,
  expect,
  describe,
  beforeAll,
  afterAll,
  afterEach,
} from "@jest/globals";

// Re-implement / import the pure helpers from prs.js for testing.
// prs.js has side-effect-free exports so we can import directly.
import {
  resolveColors,
  languageIconUrl,
  escapeXml,
  renderOrgCard,
  fetchUserPRs,
  LANG_ICON_SLUGS,
  parseCustomImages,
  parseExcludeList,
  shouldExcludeRepo,
  getRepoShortName,
  resolveOrgDisplayName,
  toRawUrl,
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

  test("adds white background behind avatar image", async () => {
    const svg = await renderOrgCard(sampleData, {}, {});
    expect(svg).toContain(
      '<rect x="20" y="20" width="60" height="60" rx="8" fill="#fff"/>',
    );
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
    // External should be empty (all PRs are to user's own repos)
    expect(data.external).toHaveLength(0);
    // Own should have the non-fork repo
    expect(data.own).toHaveLength(1);
    expect(data.own[0].org).toBe("octo");
    expect(data.own[0].repo).toBe("octo/hello-world");
    expect(data.own[0].mergedPRs).toBe(2);
    expect(data.own[0].orgDisplayName).toBe("hello-world");
  });

  test("includes org repos and honors exclude list with fork filtering", async () => {
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
                  nameWithOwner: "acme/rocket",
                  isFork: false,
                  owner: {
                    __typename: "Organization",
                    login: "acme",
                    avatarUrl: "https://avatars.githubusercontent.com/u/2",
                    name: "Acme Corp",
                  },
                  stargazerCount: 500,
                  primaryLanguage: { name: "Go" },
                },
              },
              {
                id: "pr-2",
                repository: {
                  nameWithOwner: "octo/ignored",
                  isFork: false,
                  owner: {
                    __typename: "User",
                    login: "octo",
                    avatarUrl: "https://avatars.githubusercontent.com/u/1",
                    name: "Octo",
                  },
                  stargazerCount: 10,
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
                  stargazerCount: 20,
                  primaryLanguage: { name: "TypeScript" },
                },
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }),
    }));

    const data = await fetchUserPRs("octo", "token", ["ignored"]);
    // External should have the org repo
    expect(data.external).toHaveLength(1);
    expect(data.external[0].org).toBe("acme");
    expect(data.external[0].orgDisplayName).toBe("Acme Corp");
    expect(data.external[0].repo).toBe("acme/rocket");
    expect(data.external[0].mergedPRs).toBe(1);
    // Own should be empty (excluded and forked repos were skipped)
    expect(data.own).toHaveLength(0);
  });

  test("separates external PRs from own non-fork repos", async () => {
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
                  nameWithOwner: "octo/my-project",
                  isFork: false,
                  owner: {
                    __typename: "User",
                    login: "octo",
                    avatarUrl: "https://avatars.githubusercontent.com/u/1",
                    name: "Octo",
                  },
                  stargazerCount: 50,
                  primaryLanguage: { name: "Python" },
                },
              },
              {
                id: "pr-2",
                repository: {
                  nameWithOwner: "external-org/cool-repo",
                  isFork: false,
                  owner: {
                    __typename: "Organization",
                    login: "external-org",
                    avatarUrl: "https://avatars.githubusercontent.com/u/2",
                    name: "External Org",
                  },
                  stargazerCount: 1000,
                  primaryLanguage: { name: "TypeScript" },
                },
              },
              {
                id: "pr-3",
                repository: {
                  nameWithOwner: "octo/my-project",
                  isFork: false,
                  owner: {
                    __typename: "User",
                    login: "octo",
                    avatarUrl: "https://avatars.githubusercontent.com/u/1",
                    name: "Octo",
                  },
                  stargazerCount: 50,
                  primaryLanguage: { name: "Python" },
                },
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }),
    }));

    const data = await fetchUserPRs("octo", "token");
    // External should have the org repo only
    expect(data.external).toHaveLength(1);
    expect(data.external[0].org).toBe("external-org");
    expect(data.external[0].orgDisplayName).toBe("External Org");
    expect(data.external[0].mergedPRs).toBe(1);

    // Own should have user's non-fork repos
    expect(data.own).toHaveLength(1);
    expect(data.own[0].org).toBe("octo");
    expect(data.own[0].repo).toBe("octo/my-project");
    expect(data.own[0].mergedPRs).toBe(2);
    expect(data.own[0].orgDisplayName).toBe("my-project");
  });

  test("returns separate entries for each of the user's own repos", async () => {
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
                  nameWithOwner: "octo/project-one",
                  isFork: false,
                  owner: {
                    __typename: "User",
                    login: "octo",
                    avatarUrl: "https://avatars.githubusercontent.com/u/1",
                    name: "Octo",
                  },
                  stargazerCount: 10,
                  primaryLanguage: { name: "JavaScript" },
                },
              },
              {
                id: "pr-2",
                repository: {
                  nameWithOwner: "octo/project-two",
                  isFork: false,
                  owner: {
                    __typename: "User",
                    login: "octo",
                    avatarUrl: "https://avatars.githubusercontent.com/u/1",
                    name: "Octo",
                  },
                  stargazerCount: 20,
                  primaryLanguage: { name: "Python" },
                },
              },
              {
                id: "pr-3",
                repository: {
                  nameWithOwner: "octo/project-one",
                  isFork: false,
                  owner: {
                    __typename: "User",
                    login: "octo",
                    avatarUrl: "https://avatars.githubusercontent.com/u/1",
                    name: "Octo",
                  },
                  stargazerCount: 10,
                  primaryLanguage: { name: "JavaScript" },
                },
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      }),
    }));

    const data = await fetchUserPRs("octo", "token");
    expect(data.external).toHaveLength(0);
    expect(data.own).toHaveLength(2);
    const projectOne = data.own.find(
      (entry) => entry.repo === "octo/project-one",
    );
    const projectTwo = data.own.find(
      (entry) => entry.repo === "octo/project-two",
    );
    expect(projectOne?.mergedPRs).toBe(2);
    expect(projectTwo?.mergedPRs).toBe(1);
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

describe("parseCustomImages", () => {
  test("parses key: value lines", () => {
    const input = `
MyRepo: https://example.com/my-repo.png
owner/OtherRepo: https://example.com/other.svg
`;
    const result = parseCustomImages(input);
    expect(result["MyRepo"]).toBe("https://example.com/my-repo.png");
    expect(result["owner/OtherRepo"]).toBe("https://example.com/other.svg");
  });

  test("ignores blank lines and comments", () => {
    const input = `
# this is a comment
MyRepo: https://example.com/img.png

# another comment
`;
    const result = parseCustomImages(input);
    expect(Object.keys(result)).toHaveLength(1);
    expect(result["MyRepo"]).toBe("https://example.com/img.png");
  });

  test("handles image URLs that contain colons (http/https)", () => {
    const input = "MyRepo: https://example.com/img.png";
    const result = parseCustomImages(input);
    expect(result["MyRepo"]).toBe("https://example.com/img.png");
  });

  test("returns empty object for empty or undefined input", () => {
    expect(parseCustomImages("")).toEqual({});
    expect(parseCustomImages(undefined)).toEqual({});
  });

  test("skips lines without a colon", () => {
    const input = "invalid-line-no-colon\nvalid: https://example.com/img.png";
    const result = parseCustomImages(input);
    expect(Object.keys(result)).toHaveLength(1);
    expect(result["valid"]).toBe("https://example.com/img.png");
  });
});

describe("renderOrgCard with custom images", () => {
  const sampleData = {
    org: "octocat",
    orgDisplayName: "MyRepo",
    avatarUrl: "https://avatars.githubusercontent.com/u/1",
    repo: "octocat/MyRepo",
    stars: 100,
    mergedPRs: 5,
    language: "Python",
  };

  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("uses custom image URL instead of avatarUrl when provided by full repo name", async () => {
    const fetchedUrls = [];
    globalThis.fetch = jest.fn(async (url) => {
      fetchedUrls.push(url);
      return {
        ok: true,
        status: 200,
        headers: { get: () => "image/png" },
        arrayBuffer: async () => new ArrayBuffer(8),
      };
    });

    await renderOrgCard(
      sampleData,
      {},
      {},
      { "octocat/MyRepo": "https://custom.example.com/logo.png" },
    );

    expect(fetchedUrls[0]).toBe("https://custom.example.com/logo.png");
    expect(fetchedUrls[0]).not.toContain(sampleData.avatarUrl);
  });

  test("uses custom image URL when provided by short repo name", async () => {
    const fetchedUrls = [];
    globalThis.fetch = jest.fn(async (url) => {
      fetchedUrls.push(url);
      return {
        ok: true,
        status: 200,
        headers: { get: () => "image/png" },
        arrayBuffer: async () => new ArrayBuffer(8),
      };
    });

    await renderOrgCard(
      sampleData,
      {},
      {},
      { MyRepo: "https://custom.example.com/logo.png" },
    );

    expect(fetchedUrls[0]).toBe("https://custom.example.com/logo.png");
  });

  test("uses custom image URL when provided by org name", async () => {
    const fetchedUrls = [];
    globalThis.fetch = jest.fn(async (url) => {
      fetchedUrls.push(url);
      return {
        ok: true,
        status: 200,
        headers: { get: () => "image/png" },
        arrayBuffer: async () => new ArrayBuffer(8),
      };
    });

    await renderOrgCard(
      sampleData,
      {},
      {},
      { octocat: "https://custom.example.com/logo.png" },
    );

    expect(fetchedUrls[0]).toBe("https://custom.example.com/logo.png");
  });

  test("falls back to avatarUrl when no custom image matches", async () => {
    const fetchedUrls = [];
    globalThis.fetch = jest.fn(async (url) => {
      fetchedUrls.push(url);
      return {
        ok: true,
        status: 200,
        headers: { get: () => "image/png" },
        arrayBuffer: async () => new ArrayBuffer(8),
      };
    });

    await renderOrgCard(
      sampleData,
      {},
      {},
      { "some/OtherRepo": "https://custom.example.com/logo.png" },
    );

    expect(fetchedUrls[0]).toContain(sampleData.avatarUrl);
  });

  test("converts GitHub blob URL to raw URL before fetching", async () => {
    const fetchedUrls = [];
    globalThis.fetch = jest.fn(async (url) => {
      fetchedUrls.push(url);
      return {
        ok: true,
        status: 200,
        headers: { get: () => "image/png" },
        arrayBuffer: async () => new ArrayBuffer(8),
      };
    });

    await renderOrgCard(
      sampleData,
      {},
      {},
      {
        "octocat/MyRepo":
          "https://github.com/octocat/MyRepo/blob/main/logo.png",
      },
    );

    expect(fetchedUrls[0]).toBe(
      "https://raw.githubusercontent.com/octocat/MyRepo/main/logo.png",
    );
  });
});

describe("toRawUrl", () => {
  test("converts GitHub blob URL to raw.githubusercontent.com URL", () => {
    expect(
      toRawUrl("https://github.com/owner/repo/blob/main/images/logo.png"),
    ).toBe("https://raw.githubusercontent.com/owner/repo/main/images/logo.png");
  });

  test("strips ?raw=true query parameter when converting", () => {
    expect(
      toRawUrl(
        "https://github.com/owner/repo/blob/main/images/logo.png?raw=true",
      ),
    ).toBe("https://raw.githubusercontent.com/owner/repo/main/images/logo.png");
  });

  test("handles nested paths correctly", () => {
    expect(
      toRawUrl(
        "https://github.com/swansonk14/typed-argument-parser/blob/main/images/tap_logo.png",
      ),
    ).toBe(
      "https://raw.githubusercontent.com/swansonk14/typed-argument-parser/main/images/tap_logo.png",
    );
  });

  test("returns non-GitHub URLs unchanged", () => {
    const url = "https://example.com/logo.png";
    expect(toRawUrl(url)).toBe(url);
  });

  test("returns raw.githubusercontent.com URLs unchanged", () => {
    const url = "https://raw.githubusercontent.com/owner/repo/main/logo.png";
    expect(toRawUrl(url)).toBe(url);
  });

  test("returns GitHub avatar URLs unchanged", () => {
    const url = "https://avatars.githubusercontent.com/u/1525981";
    expect(toRawUrl(url)).toBe(url);
  });
});
