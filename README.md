# GitHub Readme Stats Action

Generate GitHub pull request contribution cards in your GitHub Actions workflow, commit them to your profile repository, and embed them directly from there.

## Quick start

```yaml
name: Update README cards

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
        uses: Daraan/github-readme-stats-action
        with:
          username: ${{ github.repository_owner }}
          theme: default
          path: profile/prs- # filename prefix; one SVG per org is generated
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Commit cards
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add profile/*.svg
          git commit -m "Update README cards" || exit 0
          git push
```

Then embed from your profile README:

```md
![PRs](./profile/prs-some-org.svg)
```

## Inputs

- `options`: Card options as a query string (`key=value&...`) or JSON. If `username` is omitted, the action uses the repository owner.
- `path`: Output path for the SVG file. Defaults to `profile/<card>.svg`. For the `prs` card this is a filename prefix (one SVG per organisation).
- `token`: GitHub token (PAT or `GITHUB_TOKEN`). For a PAT, use one with `repo` and `read:user` scopes.

Options can also be provided as individual inputs directly in the `with:` block. These take priority over the same keys in `options`:

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

For example, with `path: profile/prs-` the action generates files like:

- `profile/prs-<org>.svg` for external contributions
- `profile/prs-own-<repo>.svg` for PRs to the user's own repositories

The `prs` card supports theme and colour options: `theme`, `title_color`, `text_color`, `icon_color`, `bg_color`, `border_color`, `hide_border`, `border_radius`.

Use `exclude` with a comma-separated list (e.g. `exclude=pydantic,foo`) to skip repositories whose names contain those terms.
