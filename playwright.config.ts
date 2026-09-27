import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

// Same isolation strategy as spec/global-setup.ts: boot the BUILT server
// artefact (never the dev server) with DATABASE_PATH pointed at a fresh
// temp directory, so a full browser run of this suite never touches a
// developer's own ./.data/app.db. Migrations + demo seeding both run
// automatically and idempotently at server boot (src/lib/db.ts), so a
// throwaway path is all a fresh, fully-seeded instance needs.
const entry = "./dist/server/entry.mjs";
if (!existsSync(entry)) {
  throw new Error(`${entry} not found — run \`pnpm build\` before Playwright (or use \`pnpm test:e2e\`)`);
}

// One server+database PER viewport project, not one shared across the whole
// run: the test file mutates real server-side state (candidates, confirmed
// enrolment), so if both projects hit the same instance, whichever project
// runs second silently inherits the first project's leftover state instead
// of starting from a fresh seed. Distinct ports + distinct temp DB dirs give
// each project a fully independent instance.
function serverFor(port: number) {
  const baseURL = `http://127.0.0.1:${port}`;
  return {
    baseURL,
    webServer: {
      command: `node ${entry}`,
      url: baseURL,
      reuseExistingServer: false,
      timeout: 20_000,
      env: {
        ...(process.env as Record<string, string>),
        HOST: "127.0.0.1",
        PORT: String(port),
        DATABASE_PATH: join(mkdtempSync(join(tmpdir(), "e2e-db-")), "test.db"),
      },
    },
  };
}

const desktop = serverFor(4399);
const mobile = serverFor(4400);

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [desktop.webServer, mobile.webServer],
  projects: [
    { name: "desktop-1920x1080", use: { viewport: { width: 1920, height: 1080 }, baseURL: desktop.baseURL } },
    { name: "mobile-390x844", use: { viewport: { width: 390, height: 844 }, baseURL: mobile.baseURL } },
  ],
});
