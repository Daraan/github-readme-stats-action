# GitHub Readme Stats Action

Generate GitHub stats and pull request contribution cards in your GitHub Actions workflow, commit them to your profile repository, and embed them directly from there.

> **Note:** This project is based on [readme-tools/github-readme-stats](https://github.com/readme-tools/github-readme-stats) and reuses some of their code, but does not provide all features.
> It extends the `stats` card with a profile avatar rank icon option
> and a custom `prs` card for visualising merged pull request contributions.

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

      - name: Generate stats card
        # Erliest and first stable release that supports profile picture - might be deprecated to standalone later
        uses: Daraan/github-readme-stats-action@2009edc011f4764bf09d2044726613ef1d4cfb00
        with:
          card: stats
          options: username=${{ github.repository_owner }}&show_icons=true&rank_icon=profile
          path: profile/stats.svg
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Generate PRs card
        uses: Daraan/github-readme-stats-action # Use latest version for newest PRs features
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
- `custom_images`: Custom image URLs for specific repositories, overriding the default owner avatar. Provide one mapping per line in `repo_name: image_url` format. The key can be a full repo name (`owner/repo`), a short repo name (`repo`), or an org/user login. Example:
  
  ```yaml
  custom_images: |
    MyRepo: https://example.com/my-repo-logo.png
    owner/OtherRepo: https://example.com/other-logo.svg
  ```

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


## Notes

- The upstream stats card renderer is provided by [readme-tools/github-readme-stats](https://github.com/readme-tools/github-readme-stats).
