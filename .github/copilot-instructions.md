# Project Instructions

## GitHub Workflow

- Use GitHub directly for all GitHub operations, including pull requests and issues.
- Never use GitKraken integrations or tools, even when they offer GitHub as a provider.

## Local Database Workflow

- For schema changes, first update and verify `accivia_test`; never point `DATABASE_URL_TEST` at `accivia`.
- Run the relevant tests against the test database before updating the development database.
- Only after the test-database validation passes, sync `resi_control` to the verified Prisma schema.
- Before any database sync, confirm the target database name and inspect the schema diff. Do not sync production databases as part of local development.
