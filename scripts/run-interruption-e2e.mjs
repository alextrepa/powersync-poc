import { access, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const repository = process.cwd();
const evidence = resolve(repository, "tests/qa/evidence");
const containerName = "plant-route-poc-interruption-e2e";
const marker = (name) => resolve(evidence, `interruption-${name}`);
const markerNames = [
  "ready",
  "services-stopped",
  "reconnect-observed",
  "services-restored",
  "browser-complete",
];
const run = (args, options = {}) => {
  const result = spawnSync("docker", args, {
    cwd: repository,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.status !== 0)
    throw new Error(
      `docker ${args.join(" ")} failed: ${result.stderr || result.stdout}`,
    );
  return result.stdout?.trim() ?? "";
};
const waitFor = async (path, timeoutMs = 90_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    }
  }
  throw new Error(`Timed out waiting for ${path}`);
};

for (const name of markerNames) await rm(marker(name), { force: true });
const existing = spawnSync("docker", ["container", "inspect", containerName], {
  cwd: repository,
  stdio: "ignore",
});
if (existing.status === 0)
  throw new Error(`Refusing to replace existing container ${containerName}`);

const startedAt = new Date().toISOString();
let exitCode = -1;
try {
  run([
    "compose",
    "--profile",
    "test",
    "run",
    "--build",
    "-d",
    "--name",
    containerName,
    "-e",
    "INTERRUPTION_ORCHESTRATED=true",
    "e2e",
    "npx",
    "playwright",
    "test",
    "tests/e2e/interruption.spec.ts",
  ]);
  await waitFor(marker("ready"));
  run(["compose", "stop", "api", "powersync"]);
  const stoppedAt = new Date().toISOString();
  await writeFile(marker("services-stopped"), stoppedAt, "utf8");
  await waitFor(marker("reconnect-observed"));
  run(["compose", "up", "-d", "--wait", "api", "powersync"]);
  const restoredAt = new Date().toISOString();
  await writeFile(marker("services-restored"), restoredAt, "utf8");
  await waitFor(marker("browser-complete"));
  run(["wait", containerName], { capture: true });
  exitCode = Number(
    run(
      ["inspect", "--format", "{{.State.ExitCode}}", containerName],
      { capture: true },
    ),
  );
  const logs = run(["logs", containerName], { capture: true });
  await writeFile(resolve(evidence, "interruption-container.log"), logs, "utf8");
  await writeFile(
    resolve(evidence, "interruption-summary.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        scenario: "queued work survives simultaneous API and PowerSync interruption",
        startedAt,
        stoppedAt,
        restoredAt,
        exitCode,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  if (exitCode !== 0) throw new Error(`Interruption browser exited ${exitCode}`);
} finally {
  const inspect = spawnSync("docker", ["container", "inspect", containerName], {
    cwd: repository,
    stdio: "ignore",
  });
  if (inspect.status === 0)
    spawnSync("docker", ["container", "rm", containerName], {
      cwd: repository,
      stdio: "inherit",
    });
}
