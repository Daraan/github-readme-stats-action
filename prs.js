// @ts-check

import { Buffer } from "node:buffer";
import { themes } from "github-readme-stats/themes/index.js";

/**
 * @typedef {Object} OrgPRData
 * @property {string} org - Organization login.
 * @property {string} orgDisplayName - Organization display name.
 * @property {string} avatarUrl - Organization avatar URL.
 * @property {string} repo - Main repository name (most stars).
 * @property {number} stars - Star count of the main repo.
 * @property {number} mergedPRs - Count of merged PRs by the user.
 * @property {string} language - Primary language of the main repo.
 */

/**
 * Well-known language → devicon slug mappings.
 * @type {Record<string, string>}
 */
const LANG_ICON_SLUGS = {
  JavaScript: "javascript/javascript-original",
  TypeScript: "typescript/typescript-original",
  Python: "python/python-original",
  Java: "java/java-original",
  "C#": "csharp/csharp-original",
  "C++": "cplusplus/cplusplus-original",
  C: "c/c-original",
  Go: "go/go-original",
  Rust: "rust/rust-original",
  Ruby: "ruby/ruby-original",
  PHP: "php/php-original",
  Swift: "swift/swift-original",
  Kotlin: "kotlin/kotlin-original",
  Scala: "scala/scala-original",
  Dart: "dart/dart-original",
  Lua: "lua/lua-original",
  R: "r/r-original",
  Perl: "perl/perl-original",
  Haskell: "haskell/haskell-original",
  Elixir: "elixir/elixir-original",
  Clojure: "clojure/clojure-original",
  Shell: "bash/bash-original",
  HTML: "html5/html5-original",
  CSS: "css3/css3-original",
  Vue: "vuejs/vuejs-original",
  Svelte: "svelte/svelte-original",
  Objective_C: "objectivec/objectivec-plain",
  "Objective-C": "objectivec/objectivec-plain",
  Jupyter_Notebook: "jupyter/jupyter-original",
  "Jupyter Notebook": "jupyter/jupyter-original",
};

/**
 * Return the jsdelivr devicon URL for a language, or `null` if unknown.
 * @param {string} language
 * @returns {string | null}
 */
const languageIconUrl = (language) => {
  const slug = LANG_ICON_SLUGS[language];
  if (!slug) return null;
  return `https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/${slug}.svg`;
};

/**
 * Language color from upstream github-readme-stats languageColors.json.
 * Falls back to a neutral grey.
 * @param {string} language
 * @param {Record<string, string>} colorMap
 * @returns {string}
 */
const languageColor = (language, colorMap) => colorMap[language] || "#586069";

/**
 * Parse a comma-separated exclude list into normalized entries.
 * @param {string | undefined} value
 * @returns {string[]}
 */
const parseExcludeList = (value) => {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
};

/**
 * Check if a repository name should be excluded.
 * @param {string} repoName
 * @param {string[]} excludeList
 * @returns {boolean}
 */
const shouldExcludeRepo = (repoName, excludeList) => {
  if (!excludeList.length) return false;
  const haystack = repoName.toLowerCase();
  return excludeList.some((entry) => haystack.includes(entry));
};

/**
 * Get the short repository name without owner prefix.
 * @param {string} repoName
 * @returns {string}
 */
const getRepoShortName = (repoName) => {
  if (!repoName) return "";
  const parts = repoName.split("/");
  return parts[parts.length - 1] || repoName;
};

/**
 * Resolve the display name for an org/user entry.
 * @param {string} ownerType
 * @param {string} orgDisplayName
 * @param {string} repoName
 * @returns {string}
 */
const resolveOrgDisplayName = (ownerType, orgDisplayName, repoName) => {
  if (ownerType === "Organization") return orgDisplayName;
  const repoShortName = getRepoShortName(repoName);
  return repoShortName || orgDisplayName;
};

// ---------------------------------------------------------------------------
// GitHub GraphQL fetcher
// ---------------------------------------------------------------------------

const SEARCH_MERGED_PRS_QUERY = `
  query($searchQuery: String!, $after: String) {
    search(query: $searchQuery, type: ISSUE, first: 100, after: $after) {
      issueCount
      pageInfo { hasNextPage endCursor }
      nodes {
        ... on PullRequest {
          repository {
            nameWithOwner
            isFork
            owner {
              __typename
              login
              avatarUrl
              ... on Organization { name }
            }
            stargazerCount
            primaryLanguage { name }
          }
        }
      }
    }
  }
`;

/**
 * Fetch merged PRs for a user from GitHub GraphQL API.
 * Paginates automatically.
 *
 * @param {string} username GitHub username.
 * @param {string} token GitHub PAT.
 * @param {string[]} [excludeList] List of repo name substrings to skip.
 * @returns {Promise<OrgPRData[]>} Aggregated PR data per organisation.
 */
const fetchUserPRs = async (username, token, excludeList = []) => {
  const headers = {
    Authorization: `bearer ${token}`,
    "Content-Type": "application/json",
  };

  const normalizedExclude = excludeList
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  /** @type {Map<string, { org: string; orgDisplayName: string; avatarUrl: string; ownerType: string; repos: Map<string, { stars: number; prs: number; language: string }> }>} */
  const orgMap = new Map();

  let after = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const body = JSON.stringify({
      query: SEARCH_MERGED_PRS_QUERY,
      variables: {
        searchQuery: `type:pr author:${username} is:merged`,
        after,
      },
    });

    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers,
      body,
    });

    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
    }

    const json = await res.json();
    if (json.errors) {
      throw new Error(`GitHub GraphQL errors: ${JSON.stringify(json.errors)}`);
    }

    const search = json.data.search;
    for (const node of search.nodes) {
      if (!node.repository) continue;
      const ownerLogin = node.repository.owner.login;
      const repoName = node.repository.nameWithOwner;
      const ownerType = node.repository.owner.__typename || "User";
      const isFork = node.repository.isFork;

      if (ownerLogin === username && isFork) continue;
      if (shouldExcludeRepo(repoName, normalizedExclude)) continue;

      if (!orgMap.has(ownerLogin)) {
        orgMap.set(ownerLogin, {
          org: ownerLogin,
          orgDisplayName: node.repository.owner.name || ownerLogin,
          avatarUrl: node.repository.owner.avatarUrl,
          ownerType,
          repos: new Map(),
        });
      }

      const orgEntry = orgMap.get(ownerLogin);
      if (!orgEntry.repos.has(repoName)) {
        orgEntry.repos.set(repoName, {
          stars: node.repository.stargazerCount,
          prs: 0,
          language: node.repository.primaryLanguage?.name || "",
        });
      }
      orgEntry.repos.get(repoName).prs += 1;
    }

    hasNextPage = search.pageInfo.hasNextPage;
    after = search.pageInfo.endCursor;
  }

  // For each org pick the "main" repo (most stars) and sum PRs.
  /** @type {OrgPRData[]} */
  const result = [];
  for (const entry of orgMap.values()) {
    let mainRepo = { name: "", stars: 0, language: "" };
    let totalPRs = 0;
    for (const [name, info] of entry.repos) {
      totalPRs += info.prs;
      if (info.stars > mainRepo.stars) {
        mainRepo = { name, stars: info.stars, language: info.language };
      }
    }
    const displayName = resolveOrgDisplayName(
      entry.ownerType,
      entry.orgDisplayName,
      mainRepo.name,
    );
    result.push({
      org: entry.org,
      orgDisplayName: displayName,
      avatarUrl: entry.avatarUrl,
      repo: mainRepo.name,
      stars: mainRepo.stars,
      mergedPRs: totalPRs,
      language: mainRepo.language,
    });
  }

  // Sort descending by merged PRs.
  result.sort((a, b) => b.mergedPRs - a.mergedPRs);
  return result;
};

// ---------------------------------------------------------------------------
// SVG card renderer
// ---------------------------------------------------------------------------

/**
 * Resolve theme colours with user overrides, mirroring upstream getCardColors.
 * @param {Record<string, string>} options
 * @returns {{ titleColor: string; textColor: string; iconColor: string; bgColor: string; borderColor: string }}
 */
const resolveColors = (options) => {
  const themeName = options.theme || "default";
  const base = themes[themeName] || themes["default"];
  const fallback = themes["default"];

  const hex = (v, fb) => {
    if (v && /^([A-Fa-f0-9]{3,8})$/.test(v)) return `#${v}`;
    return fb;
  };

  return {
    titleColor: hex(
      options.title_color,
      `#${base.title_color || fallback.title_color}`,
    ),
    textColor: hex(
      options.text_color,
      `#${base.text_color || fallback.text_color}`,
    ),
    iconColor: hex(
      options.icon_color,
      `#${base.icon_color || fallback.icon_color}`,
    ),
    bgColor: hex(options.bg_color, `#${base.bg_color || fallback.bg_color}`),
    borderColor: hex(
      options.border_color,
      `#${base.border_color || fallback.border_color}`,
    ),
  };
};

/**
 * Fetch an image and return it as a Base64 data URI.
 * @param {string} url Image URL.
 * @returns {Promise<string>} data URI.
 */
const fetchImageDataUri = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url} (${res.status})`);
  const buf = await res.arrayBuffer();
  const base64 = Buffer.from(buf).toString("base64");
  const ct = res.headers.get("content-type") || "image/png";
  return `data:${ct};base64,${base64}`;
};

/**
 * Render a single organisation PR card as SVG.
 *
 * @param {OrgPRData} data Organisation PR data.
 * @param {Record<string, string>} options User options (theme, colors).
 * @param {Record<string, string>} languageColors Language-to-color mapping.
 * @returns {Promise<string>} SVG string.
 */
const renderOrgCard = async (data, options, languageColors) => {
  const colors = resolveColors(options);
  const borderRadius = options.border_radius || "4.5";
  const hideBorder = options.hide_border === "true";

  const width = 450;
  const height = 100;
  const avatarSize = 60;

  // Fetch avatar as data URI so the SVG is self-contained.
  let avatarDataUri;
  try {
    avatarDataUri = await fetchImageDataUri(
      `${data.avatarUrl}?s=${avatarSize * 2}`,
    );
  } catch {
    avatarDataUri = "";
  }

  // Language icon
  let langIconDataUri = "";
  const langUrl = languageIconUrl(data.language);
  if (langUrl) {
    try {
      langIconDataUri = await fetchImageDataUri(langUrl);
    } catch {
      // fall through – we just won't show the icon
    }
  }

  const langColor = languageColor(data.language, languageColors);

  // Star icon (GitHub octicon star-fill, yellow)
  const starIcon = `<svg viewBox="0 0 16 16" width="16" height="16" fill="#f1e05a">
    <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25z"/>
  </svg>`;

  // Merged PR icon (GitHub octicon git-merge, purple)
  const mergedIcon = `<svg viewBox="0 0 16 16" width="16" height="16" fill="#8957e5">
    <path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0 0 .005V3.25Z"/>
  </svg>`;

  const clipId = `avatar-clip-${data.org}`;
  const avatarImage = avatarDataUri
    ? `<defs>
        <clipPath id="${clipId}">
          <rect x="20" y="20" width="${avatarSize}" height="${avatarSize}" rx="8"/>
        </clipPath>
      </defs>
      <rect x="20" y="20" width="${avatarSize}" height="${avatarSize}" rx="8" fill="#fff"/>
      <image x="20" y="20" width="${avatarSize}" height="${avatarSize}"
             href="${avatarDataUri}" clip-path="url(#${clipId})"/>`
    : "";

  const textX = 95;

  const langIconSvg =
    langIconDataUri && data.language
      ? `<image x="${width - 105}" y="23" width="16" height="16" href="${langIconDataUri}"/>
         <text x="${width - 85}" y="36" class="lang">${escapeXml(data.language)}</text>`
      : data.language
        ? `<circle cx="${width - 100}" cy="32" r="6" fill="${langColor}"/>
           <text x="${width - 88}" y="36" class="lang">${escapeXml(data.language)}</text>`
        : "";

  const formatCount = (n) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  };

  const svg = `<svg
  width="${width}" height="${height}"
  viewBox="0 0 ${width} ${height}"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
  role="img"
  aria-labelledby="title-${data.org}"
>
  <title id="title-${data.org}">${escapeXml(data.orgDisplayName)} PR Card</title>
  <style>
    .org-name {
      font: 600 16px 'Segoe UI', Ubuntu, Sans-Serif;
      fill: ${colors.titleColor};
    }
    .stat {
      font: 400 13px 'Segoe UI', Ubuntu, Sans-Serif;
      fill: ${colors.textColor};
    }
    .lang {
      font: 400 13px 'Segoe UI', Ubuntu, Sans-Serif;
      fill: ${colors.textColor};
    }
  </style>
  <rect
    x="0.5" y="0.5"
    rx="${borderRadius}"
    width="${width - 1}" height="${height - 1}"
    fill="${colors.bgColor}"
    stroke="${colors.borderColor}"
    stroke-opacity="${hideBorder ? 0 : 1}"
  />
  ${avatarImage}
  <text x="${textX}" y="42" class="org-name">${escapeXml(data.orgDisplayName)}</text>
  ${langIconSvg}
  <g transform="translate(${textX}, 58)">
    <g transform="translate(0, 0)">
      ${starIcon}
      <text x="20" y="13" class="stat">${formatCount(data.stars)}</text>
    </g>
    <g transform="translate(80, 0)">
      ${mergedIcon}
      <text x="20" y="13" class="stat">${data.mergedPRs} merged</text>
    </g>
  </g>
</svg>`;

  return svg;
};

/**
 * Escape XML special characters.
 * @param {string} s
 * @returns {string}
 */
const escapeXml = (s) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export {
  fetchUserPRs,
  renderOrgCard,
  resolveColors,
  languageIconUrl,
  escapeXml,
  LANG_ICON_SLUGS,
  parseExcludeList,
  shouldExcludeRepo,
  getRepoShortName,
  resolveOrgDisplayName,
};
