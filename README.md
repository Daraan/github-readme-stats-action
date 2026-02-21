# GitHub Readme Stats Action

Generate GitHub stats and pull request contribution cards in your GitHub Actions workflow, commit them to your profile repository, and embed them directly from there.

> **Note:** This project is based on [readme-tools/github-readme-stats](https://github.com/readme-tools/github-readme-stats) with a focus on the `stats` card (extended with a profile avatar rank icon) and a custom `prs` card for visualising merged pull request contributions.

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
      - uses: actions/checkout@v4

      - name: Generate stats card
        uses: Daraan/github-readme-stats-action@v1
        with:
          card: stats
          options: username=${{ github.repository_owner }}&show_icons=true&rank_icon=profile
          path: profile/stats.svg
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Generate PRs card
        uses: Daraan/github-readme-stats-action@v1
        with:
          card: prs
          options: username=${{ github.repository_owner }}&theme=default
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
![Stats](./profile/stats.svg)
![PRs](./profile/prs-some-org.svg)
```

## Inputs

- `card` (required): Card type. Supported: `stats`, `prs`.
- `options`: Card options as a query string (`key=value&...`) or JSON. If `username` is omitted, the action uses the repository owner.
- `path`: Output path for the SVG file. Defaults to `profile/<card>.svg`. For the `prs` card this is a filename prefix (one SVG per organisation).
- `token`: GitHub token (PAT or `GITHUB_TOKEN`). For private repo stats, use a [PAT](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) with `repo` and `read:user` scopes.

## Examples

### Stats card

Renders the standard GitHub stats card. All upstream options from [github-readme-stats](https://github.com/readme-tools/github-readme-stats) are supported.

```yaml
with:
  card: stats
  options: username=octocat&show_icons=true&hide_rank=true&bg_color=0D1117
  token: ${{ secrets.GITHUB_TOKEN }}
```

#### Profile rank icon

Pass `rank_icon=profile` to embed the user's GitHub avatar inside the rank circle instead of the default GitHub logo. This is an extension specific to this action.

```yaml
with:
  card: stats
  options: username=octocat&rank_icon=profile
  token: ${{ secrets.GITHUB_TOKEN }}
```

#### JSON options

Options can also be provided as a JSON object:

```yaml
with:
  card: stats
  options: '{"username":"octocat","show_icons":true,"hide_rank":true}'
  token: ${{ secrets.GITHUB_TOKEN }}
```

### PRs card

Generates one SVG per external organisation (where the user has contributed merged PRs) and a separate SVG for the user's own non-fork repositories (prefixed with `own-`).

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

The `prs` card supports theme and colour options: `theme`, `title_color`, `text_color`, `icon_color`, `bg_color`, `border_color`, `hide_border`, `border_radius`.

Use `exclude` with a comma-separated list (e.g. `exclude=pydantic,foo`) to skip repositories whose names contain those terms.

## Notes

- The `rank_icon=profile` option is an extension of this action. It fetches the user's GitHub avatar and embeds it in the rank circle of the stats card.
- The upstream stats card renderer is provided by [readme-tools/github-readme-stats](https://github.com/readme-tools/github-readme-stats).
