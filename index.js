import core from "@actions/core";
import { mkdir, writeFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import path from "node:path";
import statsApi from "github-readme-stats/api/index.js";
import repoApi from "github-readme-stats/api/pin.js";
import topLangsApi from "github-readme-stats/api/top-langs.js";
import wakatimeApi from "github-readme-stats/api/wakatime.js";
import gistApi from "github-readme-stats/api/gist.js";

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
 * @returns {string} SVG markup.
 */
const profileRankIcon = (dataUri) =>
  `<svg x="-38" y="-30" width="66" height="66" data-testid="profile-rank-icon">` +
  `<defs><clipPath id="profile-clip"><circle cx="33" cy="33" r="33"/></clipPath></defs>` +
  `<image width="66" height="66" href="${dataUri}" clip-path="url(#profile-clip)"/>` +
  `</svg>`;

/**
 * Replace the upstream "github" rank icon SVG element with a profile image.
 * @param {string} svg Full SVG string produced by the stats card renderer.
 * @param {string} dataUri Base64-encoded data URI of the avatar.
 * @returns {string} Modified SVG string.
 */
const injectProfileIcon = (svg, dataUri) => {
  return svg.replace(
    /<svg[^>]*data-testid="github-rank-icon"[^>]*>[\s\S]*?<\/svg>/,
    profileRankIcon(dataUri),
  );
};

// Map of card types to their respective API handlers.
// TODO: Replace handler usage with a stable library API once exposed upstream.
const cardHandlers = {
  stats: statsApi,
  "top-langs": topLangsApi,
  pin: repoApi,
  wakatime: wakatimeApi,
  gist: gistApi,
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
    case "top-langs":
    case "wakatime":
      if (!query.username) {
        throw new Error(`username is required for the ${card} card.`);
      }
      break;
    case "pin":
      if (!query.repo) {
        throw new Error("repo is required for the pin card.");
      }
      break;
    case "gist":
      if (!query.id) {
        throw new Error("id is required for the gist card.");
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

  const handler = cardHandlers[card];
  if (!handler) {
    throw new Error(`Unsupported card type: ${card}`);
  }

  const query = parseOptions(optionsInput);

  validateCardOptions(card, query, process.env.GITHUB_REPOSITORY_OWNER);

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
    svg = injectProfileIcon(svg, dataUri);
  }

  await writeFile(outputPath, svg, "utf8");
  core.info(`Wrote ${outputPath}`);
  core.setOutput("path", outputPathValue);
};

run().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
