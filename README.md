# GitHub Readme Stats Action

Generate GitHub pull request contribution cards in your GitHub Actions workflow, automatically commit them to your profile repository, and embed them directly from there.
Run the action on a schedule to dynamically update your profile with your latest contribution stats.

## Quick start

```yaml
name: Update PR Stats for README

on:
  schedule:
    - cron: "0 0 * * *" # Runs once daily at midnight
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest

    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v6

      - name: Generate PRs card
        uses: Daraan/pr-stats-action@v1
        with:
          username: ${{ github.repository_owner }}
          theme: default
          path: profile/prs- # filename prefix; one SVG per org is generated
          token: ${{ secrets.GITHUB_TOKEN }}

      # This automatically commits and updates the generated cards to your profile
      - name: Commit cards
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add profile/*.svg
          git commit -m "Update PR cards" || exit 0
          git push
```

Then embed from your profile README:

```md
![PRs](./profile/prs-some-org.svg)
```

For more advanced options see the [Examples](#examples) section as well as the [How to Use in your README.md](#how-to-use-in-your-readmemd) sections below.

## Inputs

- `options`: Card options as a query string (`key=value&...`) or JSON. If `username` is omitted, the action uses the repository owner.
- `path`: Output path for the SVG file. Defaults to `profile/<card>.svg`. For the `prs` card this is a filename prefix (one SVG per organisation).
- `token`: GitHub token (PAT or `GITHUB_TOKEN`). For private repo stats, use a [PAT](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) with `repo` and `read:user` scopes.
- `custom_images`: Custom image URLs for specific repositories, overriding the default owner avatar. Provide one mapping per line in `repo_name: image_url` format. The key can be a full repo name (`owner/repo`), a short repo name (`repo`), or an org/user login. Example:
  
  ```yaml
  custom_images: |
    MyRepo: https://example.com/my-repo-logo.png
    owner/OtherRepo: https://example.com/other-logo.svg
  ```

Options can also be provided as individual inputs directly in the `with:` block. These take priority over the same keys in `options`.
Style and theme settings of [github-readme-stats](https://github.com/stats-organization/github-readme-stats) are supported.
Please refer to their documentation for usage and examples; see also [Disclaimer](#disclaimer).

| Input           | Description                                     |
| --------------- | ----------------------------------------------- |
| `username`      | GitHub username                                 |
| `theme`         | Card theme name                                 |
| `title_color`   | Title hex color (without `#`)                   |
| `text_color`    | Text hex color (without `#`)                    |
| `icon_color`    | Icon hex color (without `#`)                    |
| `bg_color`      | Background hex color (without `#`)              |
| `border_color`  | Border hex color (without `#`)                  |
| `hide_border`   | Hide the card border (`true`/`false`)           |
| `border_radius` | Card border radius                              |
| `exclude`       | Comma-separated repo name substrings to exclude |

## Examples

### PRs card

Using individual key inputs (recommended):

```yaml
with:
  username: octocat
  theme: github_dark
  path: profile/prs-
  token: ${{ secrets.GITHUB_TOKEN }}
```

Using the `options` query string (also valid; individual keys take priority if both are provided):

```yaml
with:
  options: username=octocat&theme=github_dark
  path: profile/prs-
  token: ${{ secrets.GITHUB_TOKEN }}
```

The `prs` card generates one SVG per external organization (where the user has contributed merged PRs) and a separate SVG for the user's own non-fork repositories (prefixed with `own-`).
For example, with `path: profile/prs-` the action generates files like:

- `profile/prs-<org>.svg` for external contributions
- `profile/prs-own-<repo>.svg` for PRs to the user's own repositories

```yaml
with:
  card: prs
  options: username=octocat&theme=github_dark
  path: profile/prs-
  token: ${{ secrets.GITHUB_TOKEN }}
```

Custom images example:

```yaml
with:
  card: prs
  options: username=octocat&theme=github_dark
  path: profile/prs-
  custom_images: |
    octocat/MyRepo: https://custom.example.com/logo.png
    MyRepo: https://custom.example.com/logo2.png
    octocat: https://custom.example.com/org-logo.png
  token: ${{ secrets.GITHUB_TOKEN }}
```

The `prs` card supports the same theme and colour options (`theme`, `title_color`, ...) as the other cards by github-readme-stats.

Use `exclude` with a comma-separated list (e.g. `exclude=pydantic,foo`) to skip repos containing those terms.

The `custom_images` input lets you override the avatar shown in PR cards for specific repositories or organizations. The action will check for a custom image in this order: full repo name (`owner/repo`), short repo name (`repo`), then org/user name. If no match is found, it falls back to the default avatar.

## How to Use in your README.md

Check out [my profile](https://github.com/Daraan/Daraan/README.md) for examples of the action and resulting PR cards in action.

### Link to your PRs

```md
# Replace <ORG> with the organisation (or user) to query and <USERNAME> with your username:

[![PRs At Org](./profile/prs/dark-org.svg)](https://github.com/search?q=owner%3A<ORG>>%20author%3A<USERNAME>%20is%3Amerged&type=pullrequests&s=comments&o=desc)
```

Alternative use an `<a>` tag to link the entire card.

### Light and Dark Mode Images

GitHub supports multiple images, depending on the user's theme preference.
You can use this to provide optimized images for both light and dark modes, with a fallback default option:

```md
<picture>
  <source
    srcset="./profile/prs/dark-ORG.svg"
    media="(prefers-color-scheme: dark)"
  />
  <source
    srcset="./profile/prs/light-ORG.svg"
    media="(prefers-color-scheme: light), (prefers-color-scheme: no-preference)"
  />
  <img src="./profile/prs/default-ORG.svg" height="84"  alt="ORG contributions"  />
</picture>
```

You can automatically create all versions by using a `matrix` `strategy`:

```yaml
jobs:
  build:
    strategy:
      matrix:
        include:
          - theme: light
            themeParam: '&theme=default'
          - theme: dark
            themeParam: '&theme=github_dark'
          - theme: default
            themeParam: '&theme=transparent'      # good for dark and light
    # ...

    steps:

    # ...

    - name: Generate Contributions
        uses: Daraan/pr-stats-action@v1
        with:
           username: <Your Username>
           options: ${{ matrix.themeParam }}
           path: generated/prs/${{ matrix.theme }}-
```

This will create three different differently themed images, prefixed with the theme name (`light`, `dark`, `default`).

## Disclaimer

This repository started as a fork of [github-readme-stats-action](https://github.com/stats-organization/github-readme-stats-action) which makes use of [anuraghazra/github-readme-stats](https://github.com/stats-organization/github-readme-stats).
Parts of the original code are still used; as well as all styles and themes of the base are automatically supported.
This project is a standalone for PR cards only.
