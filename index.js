import core from "@actions/core";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
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
 * Option keys that can be provided as individual action inputs.
 * These take priority over the same keys in the `options` input.
 */
const OPTION_KEYS = [
  "username",
  "theme",
  "title_color",
  "text_color",
  "icon_color",
  "bg_color",
  "border_color",
  "hide_border",
  "border_radius",
  "exclude",
];

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

  // Collect individual key inputs; they override the same keys in `options`.
  for (const key of OPTION_KEYS) {
    const val = core.getInput(key);
    if (val) query[key] = val;
  }

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

    // Load language colours for fallback dots.
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

  throw new Error(`Unsupported card type: ${card}`);
};

run().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : String(error));
});
