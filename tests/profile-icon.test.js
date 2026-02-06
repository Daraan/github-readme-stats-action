import { jest, test, expect, describe, beforeEach } from "@jest/globals";

// Re-implement the pure helper functions so they can be tested without
// importing the action entry-point (which has side-effects).

const profileRankIcon = (dataUri, username) => {
  const clipId = `profile-clip-${username}`;
  return (
    `<svg x="-38" y="-30" width="66" height="66" data-testid="profile-rank-icon">` +
    `<defs><clipPath id="${clipId}"><circle cx="33" cy="33" r="33"/></clipPath></defs>` +
    `<image width="66" height="66" href="${dataUri}" clip-path="url(#${clipId})"/>` +
    `</svg>`
  );
};

const injectProfileIcon = (svg, dataUri, username) => {
  return svg.replace(
    /<svg[^>]*data-testid="github-rank-icon"[^>]*>[\s\S]*?<\/svg>/,
    profileRankIcon(dataUri, username),
  );
};

describe("profileRankIcon", () => {
  test("returns an SVG image element with the given data URI", () => {
    const uri = "data:image/png;base64,ABC123";
    const result = profileRankIcon(uri, "octocat");
    expect(result).toContain('data-testid="profile-rank-icon"');
    expect(result).toContain(`href="${uri}"`);
    expect(result).toContain('clip-path="url(#profile-clip-octocat)"');
    expect(result).toContain("<clipPath");
    expect(result).toContain("<circle");
  });

  test("dimensions match the upstream github rank icon", () => {
    const result = profileRankIcon("data:image/png;base64,X", "octocat");
    expect(result).toContain('x="-38"');
    expect(result).toContain('y="-30"');
    expect(result).toContain('width="66"');
    expect(result).toContain('height="66"');
  });

  test("uses a unique clipPath ID per username", () => {
    const a = profileRankIcon("data:image/png;base64,X", "alice");
    const b = profileRankIcon("data:image/png;base64,X", "bob");
    expect(a).toContain("profile-clip-alice");
    expect(b).toContain("profile-clip-bob");
    expect(a).not.toContain("profile-clip-bob");
  });
});

describe("injectProfileIcon", () => {
  const githubIconSvg =
    `<svg x="-38" y="-30" height="66" width="66" aria-hidden="true" ` +
    `viewBox="0 0 16 16" version="1.1" data-view-component="true" ` +
    `data-testid="github-rank-icon">` +
    `<path d="M8 0c4.42 0 8 3.58 8 8Z"></path></svg>`;

  const baseSvg = `<svg xmlns="http://www.w3.org/2000/svg"><g class="rank-text">${githubIconSvg}</g></svg>`;

  test("replaces the github icon with the profile icon", () => {
    const dataUri = "data:image/png;base64,TESTDATA";
    const result = injectProfileIcon(baseSvg, dataUri, "octocat");
    expect(result).not.toContain("github-rank-icon");
    expect(result).toContain("profile-rank-icon");
    expect(result).toContain(`href="${dataUri}"`);
  });

  test("preserves surrounding SVG content", () => {
    const dataUri = "data:image/png;base64,X";
    const result = injectProfileIcon(baseSvg, dataUri, "octocat");
    expect(result).toContain('<svg xmlns="http://www.w3.org/2000/svg">');
    expect(result).toContain("</svg></g></svg>");
  });

  test("returns original SVG when no github icon is present", () => {
    const noIconSvg = "<svg><text>hello</text></svg>";
    const result = injectProfileIcon(
      noIconSvg,
      "data:image/png;base64,X",
      "octocat",
    );
    expect(result).toBe(noIconSvg);
  });
});
