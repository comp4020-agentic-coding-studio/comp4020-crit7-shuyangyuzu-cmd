import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["spec/**/*.test.ts", "scripts/**/*.test.ts"],
    globalSetup: ["./spec/global-setup.ts"],
    // Spec files share one server process and one sqlite file (see
    // global-setup.ts) and several of them mutate shared singleton state
    // (plan_preferences, candidate_courses) without restoring it afterward.
    // Phase 4's preferences-dependent generate tests would otherwise race
    // against preferences.test.ts's writes under the default concurrent
    // file execution.
    fileParallelism: false,
  },
});
