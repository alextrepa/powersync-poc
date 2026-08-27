import { readFile, writeFile } from "node:fs/promises";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error("Usage: summarize-convergence.mjs <input.json> <output.json>");
}

const report = JSON.parse(await readFile(inputPath, "utf8"));
const durations = [];
const visitSuite = (suite) => {
  for (const spec of suite.specs ?? [])
    for (const test of spec.tests ?? [])
      for (const result of test.results ?? []) durations.push(result.duration);
  for (const child of suite.suites ?? []) visitSuite(child);
};
for (const suite of report.suites ?? []) visitSuite(suite);

durations.sort((left, right) => left - right);
const percentile = (fraction) =>
  durations[Math.min(durations.length - 1, Math.ceil(durations.length * fraction) - 1)];
const summary = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: "Playwright JSON reporter",
  scenario: "team route survives offline reload and uploads a pickup after reconnection",
  expected: report.stats?.expected ?? 0,
  unexpected: report.stats?.unexpected ?? 0,
  skipped: report.stats?.skipped ?? 0,
  totalDurationMs: report.stats?.duration ?? 0,
  resultCount: durations.length,
  durationsMs: {
    min: durations[0] ?? null,
    median: percentile(0.5) ?? null,
    p95: percentile(0.95) ?? null,
    max: durations.at(-1) ?? null,
    average:
      durations.length === 0
        ? null
        : Math.round(
            durations.reduce((sum, duration) => sum + duration, 0) /
              durations.length,
          ),
  },
};
await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
