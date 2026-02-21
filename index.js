import core from "@actions/core";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import path from "node:path";
import statsApi from "github-readme-stats/api/index.js";
import { fetchUserPRs, renderOrgCard, parseExcludeList } from "./prs.js";

/**
 * Normalize option values to strings.
 * @param {Record<string, unknown>} options Input options.
 * @returns {Record<string, string>} Normalized options.
 */
const normalizeOptions = (options) => {
  const normalized = {};
  for (const [key, val] of Object.entries(options)) {
    if (Array.isArray(val)) {
      normalized[key] = val.join(",");
    } else if (val === null || val === undefined) {
      continue;
    } else {
      normalized[key] = String(val);
    }
  }
  return normalized;
};

/**
 * Parse options from query string or JSON and normalize values to strings.
 * @param {string} value Input value.
 * @returns {Record<string, string>} Parsed options.
 */
const parseOptions = (value) => {
  if (!value) return {};

  const trimmed = value.trim();
  const options = {};
  if (trimmed.startsWith("{")) {
    try {
      Object.assign(options, JSON.parse(trimmed));
    } catch (error) {
      throw new Error("Invalid JSON in options.");
    }
  } else {
    const queryString = trimmed.startsWith("?") ? trimmed.slice(1) : trimmed;
    const params = new URLSearchParams(queryString);
    for (const [key, val] of params.entries()) {
      if (options[key]) {
        options[key] = `${options[key]},${val}`;
      } else {
        options[key] = val;
      }
    }
  }

  return normalizeOptions(options);
};

/**
 * Fetch a GitHub user's avatar and return it as a Base64 data URI.
 * @param {string} username GitHub username.
 * @returns {Promise<string>} Data URI of the avatar image.
 */
const fetchAvatarDataUri = async (username) => {
  const url = `https://github.com/${username}.png?size=150`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch avatar for ${username}: ${response.status}`,
    );
  }
  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const contentType = response.headers.get("content-type") || "image/png";
  return `data:${contentType};base64,${base64}`;
};

/**
 * Build an SVG snippet that renders a circular profile image inside the rank
 * circle. The coordinates match those used by the upstream "github" rank icon.
 * @param {string} dataUri Base64-encoded data URI of the avatar.
 * @param {string} username GitHub username, used to create a unique clipPath ID.
 * @returns {string} SVG markup.
 */
const profileRankIcon = (dataUri, username) => {
  const clipId = `profile-clip-${username}`;
  return (
    `<svg x="-38" y="-30" width="66" height="66" data-testid="profile-rank-icon">` +
    `<defs><clipPath id="${clipId}"><circle cx="33" cy="33" r="33"/></clipPath></defs>` +
    `<image width="66" height="66" href="${dataUri}" clip-path="url(#${clipId})"/>` +
    `</svg>`
  );
};

/**
 * Replace the upstream "github" rank icon SVG element with a profile image.
 *
 * This relies on the upstream stats card emitting an element with
 * `data-testid="github-rank-icon"`.  If the upstream markup changes the
 * replacement will be a no-op and the original SVG is returned unmodified.
 *
 * @param {string} svg Full SVG string produced by the stats card renderer.
 * @param {string} dataUri Base64-encoded data URI of the avatar.
 * @param {string} username GitHub username for a unique clipPath ID.
 * @returns {string} Modified SVG string.
 */
const injectProfileIcon = (svg, dataUri, username) => {
  return svg.replace(
    /<svg[^>]*data-testid="github-rank-icon"[^>]*>[\s\S]*?<\/svg>/,
    profileRankIcon(dataUri, username),
  );
};

// Map of card types to their respective API handlers.
// TODO: Replace handler usage with a stable library API once exposed upstream.
const cardHandlers = {
  stats: statsApi,
};

/**
 * Validate required options for each card type.
 * @param {string} card Card type.
 * @param {Record<string, string>} query Parsed options.
 * @param {string | undefined} repoOwner Repository owner from environment.
 * @throws {Error} If required options are missing.
 */
const validateCardOptions = (card, query, repoOwner) => {
  if (!query.username && repoOwner) {
    query.username = repoOwner;
    core.warning("username not provided; defaulting to repository owner.");
  }
  switch (card) {
    case "stats":
    case "prs":
      if (!query.username) {
        throw new Error(`username is required for the ${card} card.`);
      }
      break;
    default:
      break;
  }
};

const run = async () => {
  const card = core.getInput("card", { required: true }).toLowerCase();
  const optionsInput = core.getInput("options") || "";
  const outputPathInput = core.getInput("path");

  const query = parseOptions(optionsInput);

  validateCardOptions(card, query, process.env.GITHUB_REPOSITORY_OWNER);

  // ---- PRs card: custom flow that produces one SVG per organisation ----
  if (card === "prs") {
    const token = process.env.PAT_1;
    if (!token) {
      throw new Error("A GitHub token is required for the PRs card.");
    }

    const excludeList = parseExcludeList(query.exclude);
    const result = await fetchUserPRs(query.username, token, excludeList);

    const allOrgs = [...result.external, ...result.own];

    if (allOrgs.length === 0) {
      core.warning(
        "No merged PRs found for user in external organizations or own repositories.",
      );
    }

    // Load upstream language colours for fallback dots.
    let languageColors = {};
    try {
      const colorsUrl = import.meta
        .resolve("github-readme-stats/src/common/languageColors.json");
      languageColors = JSON.parse(await readFile(new URL(colorsUrl), "utf8"));
    } catch {
      // non-fatal
    }

    const basePrefix = outputPathInput || path.join("profile", "prs-");
    const resolvedPrefix = path.resolve(process.cwd(), basePrefix);
    const baseDir = path.dirname(resolvedPrefix);
    const prefix = path.basename(resolvedPrefix);
    await mkdir(baseDir, { recursive: true });

    const written = [];

    // Generate cards for external organizations
    for (const orgData of result.external) {
      const rawName = orgData.repo ? orgData.repo : orgData.org;
      const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, "-");
      const filePath = path.join(baseDir, `${prefix}${safeName}.svg`);
      const svg = await renderOrgCard(orgData, query, languageColors);
      await writeFile(filePath, svg, "utf8");
      core.info(`Wrote ${filePath}`);
      written.push(path.relative(process.cwd(), filePath));
    }

    // Generate cards for user's own non-fork repos
    for (const ownData of result.own) {
      const rawName = ownData.repo ? ownData.repo : ownData.org;
      const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, "-");
      const filePath = path.join(baseDir, `${prefix}own-${safeName}.svg`);
      const svg = await renderOrgCard(ownData, query, languageColors);
      await writeFile(filePath, svg, "utf8");
      core.info(`Wrote ${filePath}`);
      written.push(path.relative(process.cwd(), filePath));
    }

    core.setOutput("path", basePrefix);
    return;
  }

  // ---- Standard card flow ----
  const handler = cardHandlers[card];
  if (!handler) {
    throw new Error(`Unsupported card type: ${card}`);
  }

  // Detect the custom "profile" rank_icon for the stats card.
  const useProfileIcon = card === "stats" && query.rank_icon === "profile";
  if (useProfileIcon) {
    // Swap to "github" so the upstream renderer produces a replaceable icon.
    query.rank_icon = "github";
  }

  const outputPathValue =
    outputPathInput || path.join("profile", `${card}.svg`);
  const outputPath = path.resolve(process.cwd(), outputPathValue);
  await mkdir(path.dirname(outputPath), { recursive: true });

  let svg = "";
  const res = {
    setHeader: () => {},
    send: (value) => {
      svg = value;
      return value;
    },
  };

  await handler({ query }, res);
  if (!svg) {
    throw new Error("Card renderer returned empty output.");
  }

  if (useProfileIcon) {
    const dataUri = await fetchAvatarDataUri(query.username);
    svg = injectProfileIcon(svg, dataUri, query.username);
  }

  await writeFile(outputPath, svg, "utf8");
  core.info(`Wrote ${outputPath}`);
  core.setOutput("path", outputPathValue);
};

run().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
