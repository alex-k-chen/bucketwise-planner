# Releasing Bucketwise Planner

This checklist covers the public release flow for Bucketwise Planner.

## Before Tagging

1. Update [CHANGELOG.md](../CHANGELOG.md) with the release notes.
2. Confirm any database-impacting changes are clearly documented.
3. Run validation locally:

```bash
pnpm exec tsc --noEmit
pnpm backend:test
```

4. Confirm Docker Hub credentials are configured as GitHub repository secrets:
   - `DOCKERHUB_USERNAME`
   - `DOCKERHUB_TOKEN`

## Create the Release

1. Commit all release-ready changes.
2. Create a semver tag:

```bash
git tag v0.4.7
git push origin v0.4.7
```

3. Wait for [docker-release.yml](../.github/workflows/docker-release.yml) to publish:
   - `slsadmin/bucketwise-planner-backend:<version>`
   - `slsadmin/bucketwise-planner-frontend:<version>`

The workflow publishes the tag without the leading `v`, so `v0.4.7` becomes Docker tag `0.4.7`.

## GitHub Release

1. Create or edit the GitHub Release for the tag.
2. Copy the key notes from [CHANGELOG.md](../CHANGELOG.md).
3. Call out any migration or upgrade requirements clearly.
4. Link to:
   - [docs/SELF_HOSTING.md](../docs/SELF_HOSTING.md)
   - [docs/UPGRADING.md](../docs/UPGRADING.md)

## Schema Safety

- Public Docker Compose deployments keep `DB_SCHEMA_MODE=auto` by default.
- Managed environments such as CasaOS can use `DB_SCHEMA_MODE=manual` to prevent routine restarts from applying schema changes.
- If a release requires a schema update in a managed environment:
  1. Back up the database.
  2. Temporarily set `DB_SCHEMA_MODE=auto`.
  3. Restart the backend once to apply schema changes.
  4. Set `DB_SCHEMA_MODE=manual` again.

## CasaOS Follow-Up

When the dedicated `casaos-appstore` branch is in use for deployment:

1. Update the CasaOS app definition to reference the new explicit image tags.
2. Refresh the CasaOS App Store source.
3. Perform any managed-environment upgrade steps required for that release.

## First CasaOS Rollout Order

For the initial CasaOS-backed release, use this order:

1. Finish and commit the release-related changes on `main`.
2. Tag and push the release, for example `v0.4.7`.
3. Wait for the Docker Hub images `slsadmin/bucketwise-planner-backend:0.4.7` and `slsadmin/bucketwise-planner-frontend:0.4.7` to publish successfully.
4. Confirm the `casaos-appstore` branch app definition points to the same explicit version tags.
5. Commit and push the `casaos-appstore` branch.
6. Add the CasaOS App Store source ZIP URL in CasaOS.
7. Install the app in CasaOS with your external `PG_CONNECTION_STRING`, secrets, and `DB_SCHEMA_MODE=manual`.
8. Leave the CasaOS `Network` field blank, leave explicit container names blank, and use `5555` for the Web UI port.
