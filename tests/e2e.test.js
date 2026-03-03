import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { jest, test, beforeAll, afterAll } from "@jest/globals";

jest.setTimeout(60_000);

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repoOwner = process.env.GITHUB_REPOSITORY_OWNER ?? "rickstaa";
const hasPat = Boolean(process.env.PAT_1);
let buildDir;

const runCard = (card, options, output) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(rootDir, "index.js")], {
      stdio: "inherit",
      env: {
        ...process.env,
        INPUT_CARD: card,
        INPUT_OPTIONS: options,
        INPUT_PATH: output,
      },
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Card ${card} failed with code ${code}`));
      }
    });
  });

beforeAll(async () => {
  if (!hasPat) {
    return;
  }
  buildDir = await mkdtemp(path.join(os.tmpdir(), "grs-action-"));
});

afterAll(async () => {
  if (buildDir) {
    await rm(buildDir, { recursive: true, force: true });
  }
});

const e2eTest = hasPat ? test : test.skip;

e2eTest("generates prs card locally", async () => {
  const prsPrefix = path.join(buildDir, "prs-");

  await runCard("prs", `username=${repoOwner}`, prsPrefix);
});
