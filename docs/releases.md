# Releases

The project follows SemVer. Before 1.0, minor releases may break compatibility; patch releases should contain compatible fixes. Stable API compatibility is not promised yet. `package.json` is the version source; the root lockfile version must match it.

## Maintainer procedure

1. Complete offline checks and the clean-container smoke check. Run the opt-in live check with your own Codex account; record date, CLI version, model and outcome without credentials.
2. Update CHANGELOG.md, moving completed Unreleased entries into a dated release heading.
3. Run `npm version 0.1.0 --no-git-tag-version --allow-same-version` (replace the example version for subsequent releases). Commit the reviewed version/lockfile/changelog changes through a PR and merge after required checks pass.
4. Tag that exact commit on `main`: `git tag -a v0.1.0 -m 'Harness Relay v0.1.0'`, then explicitly push the tag.

CI verifies that the tag matches package/lockfile versions and that the tagged commit is reachable from `main`. It runs checks, builds and smoke-tests the Linux amd64 runtime image, then publishes version and SHA tags to `ghcr.io/skadi-1894/harness-relay`. A GitHub release with generated notes is created only after the image job succeeds. Prerelease versions are marked as prereleases; use the complete prerelease version as the image tag. `latest` is a moving build of `main`, not a stable-release promise.

The first GHCR package may need its visibility changed to public under package settings. No image or release exists until code and a version tag have been pushed. The workflow never uploads provider auth state.

## Repository protections

The main ruleset requires PRs, passing `check` and `image` jobs, resolved review conversations, and blocks force pushes/deletion. Reviews are welcome but a second approval is not required for a solo-maintainer project. Repository administrators retain an explicit bypass for bootstrap and emergency recovery. GitHub Actions has read-only repository access by default; only publishing jobs receive write permissions.

Tag rules prevent changes/deletions under `v*`; release tags are created by repository administrators. Dependabot proposes dependency, Docker and pinned Actions updates. Maintainers must review these PRs; updates are not automatically merged.
