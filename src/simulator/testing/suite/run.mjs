import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { capabilities, cases, preflights, profiles, supportSources } from "./manifest.mjs";

const suiteRoot = dirname(fileURLToPath(import.meta.url));
const testingRoot = resolve(suiteRoot, "..");
const repositoryRoot = resolve(testingRoot, "..", "..", "..");
const options = parseArguments(process.argv.slice(2));
validateManifest();

if (options.list) {
  printList();
  process.exit(0);
}

const selected = selectCases();
if (selected.length === 0) throw new Error("suite selection contains no cases");
const tempRoot = mkdtempSync(join(tmpdir(), "garupa-simulator-suite-"));
const compiledRoot = join(tempRoot, "compiled");
const observationPath = join(tempRoot, "actual-pixi-observation.json");
const substitutions = new Map([["$PIXEL_OBSERVATION", observationPath]]);
const baseEnvironment = {
  ...process.env,
  NODE_PATH: join(repositoryRoot, "node_modules"),
  SIMULATOR_TEST_COMPILED_ROOT: compiledRoot,
  SIMULATOR_TEST_SHARED_PREFLIGHT: "1",
  ...(options.cleanBrowserBuild ? { SIMULATOR_WEBVIEW2_CLEAN_BUILD: "1" } : {}),
};
const startedAt = Date.now();
const executed = [];

try {
  await runStep("compile.simulator", process.execPath, [
    "node_modules/typescript/bin/tsc", "-p", "src/simulator/tsconfig.json",
  ], 300_000, baseEnvironment);
  await runStep("compile.tests", process.execPath, [
    "node_modules/typescript/bin/tsc", "-p", "src/simulator/testing/tsconfig.tests.json",
    "--outDir", compiledRoot,
  ], 300_000, baseEnvironment);
  for (const preflight of preflights) {
    await runStep(preflight.id, process.execPath, [
      resolve(testingRoot, preflight.path), ...(preflight.args ?? []),
    ], preflight.timeoutMs, baseEnvironment);
  }
  for (const testCase of topologicalOrder(selected)) {
    const command = commandFor(testCase);
    const env = {
      ...baseEnvironment,
      ...Object.fromEntries(Object.entries(testCase.env ?? {}).map(([key, value]) => [key, substitute(value)])),
    };
    const args = command.args.map(substitute);
    if (testCase.id === "product-chart.external") args.push(...options.trailingArguments);
    await runStep(testCase.id, command.executable, args, testCase.timeoutMs, env);
    executed.push(testCase);
  }
  const capabilityCount = new Set(executed.map((entry) => entry.capability)).size;
  const stageCount = new Set(executed.map((entry) => entry.stage)).size;
  console.log(
    `\nsimulator suite passed: profile=${options.profile} cases=${executed.length} ` +
    `capabilities=${capabilityCount} stages=${stageCount} testCompile=1 ` +
    `webview2=${executed.filter((entry) => entry.type === "webview2").length} ` +
    `elapsedMs=${Date.now() - startedAt}`,
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

function commandFor(testCase) {
  if (testCase.type === "compiled-test") {
    const emitted = testCase.path.replace(/\.ts$/, ".js");
    return {
      executable: process.execPath,
      args: [join(compiledRoot, "src", "simulator", "testing", emitted), ...(testCase.args ?? [])],
    };
  }
  return {
    executable: process.execPath,
    args: [resolve(testingRoot, testCase.path), ...(testCase.args ?? [])],
  };
}

function selectCases() {
  let selected;
  if (options.caseId !== null) {
    const target = cases.find((entry) => entry.id === options.caseId);
    if (!target) throw new Error(`unknown case: ${options.caseId}`);
    selected = [target];
  } else {
    selected = cases.filter((entry) => entry.profiles.includes(options.profile));
    if (options.capability !== null) {
      selected = selected.filter((entry) => entry.capability === options.capability);
    }
  }
  const byId = new Map(cases.map((entry) => [entry.id, entry]));
  const result = new Map(selected.map((entry) => [entry.id, entry]));
  const visit = (entry) => {
    for (const dependencyId of entry.dependencies ?? []) {
      const dependency = byId.get(dependencyId);
      if (!dependency) throw new Error(`${entry.id} has unknown dependency ${dependencyId}`);
      result.set(dependency.id, dependency);
      visit(dependency);
    }
  };
  for (const entry of selected) visit(entry);
  return [...result.values()];
}

function topologicalOrder(selected) {
  const selectedIds = new Set(selected.map((entry) => entry.id));
  const byId = new Map(selected.map((entry) => [entry.id, entry]));
  const result = [];
  const permanent = new Set();
  const temporary = new Set();
  const visit = (entry) => {
    if (permanent.has(entry.id)) return;
    if (temporary.has(entry.id)) throw new Error(`case dependency cycle at ${entry.id}`);
    temporary.add(entry.id);
    for (const dependency of entry.dependencies ?? []) {
      if (selectedIds.has(dependency)) visit(byId.get(dependency));
    }
    temporary.delete(entry.id);
    permanent.add(entry.id);
    result.push(entry);
  };
  for (const entry of selected) visit(entry);
  return result;
}

async function runStep(id, executable, args, timeoutMs, env) {
  console.log(`\n=== simulator suite: ${id} ===`);
  await new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, {
      cwd: repositoryRoot,
      env,
      stdio: "inherit",
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    if (typeof child.pid !== "number") {
      reject(new Error(`${id} did not expose a process id`));
      return;
    }
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      terminateOwnedProcessTree(child.pid);
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) reject(new Error(`${id} timed out after ${timeoutMs}ms (owned pid ${child.pid})`));
      else if (code !== 0) reject(new Error(`${id} failed: exit=${String(code)} signal=${String(signal)}`));
      else resolvePromise();
    });
  });
}

function terminateOwnedProcessTree(pid) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } else {
    try { process.kill(-pid, "SIGKILL"); } catch { /* already exited */ }
  }
}

function validateManifest() {
  const allowedTypes = new Set(["compiled-test", "node-test", "static-check", "webview2"]);
  const allowedAuthority = new Set([
    "reverse-fixture", "product-contract", "product-regression", "platform-observation", "historical-boundary",
  ]);
  const ids = new Set();
  for (const entry of cases) {
    if (ids.has(entry.id)) throw new Error(`duplicate case id: ${entry.id}`);
    ids.add(entry.id);
    if (!capabilities.includes(entry.capability)) throw new Error(`${entry.id} has unknown capability`);
    if (!allowedTypes.has(entry.type)) throw new Error(`${entry.id} has unknown type`);
    if (!allowedAuthority.has(entry.authority)) throw new Error(`${entry.id} has unknown authority tag`);
    if (!Array.isArray(entry.profiles) || entry.profiles.some((profile) => !profiles.includes(profile))) {
      throw new Error(`${entry.id} has an invalid profile`);
    }
    if (!entry.optIn && entry.profiles.length === 0) throw new Error(`${entry.id} is not covered by a profile`);
    if (!existsSync(resolve(testingRoot, entry.path))) throw new Error(`${entry.id} path is missing: ${entry.path}`);
    for (const source of entry.sources ?? []) {
      if (!existsSync(resolve(testingRoot, source))) throw new Error(`${entry.id} source is missing: ${source}`);
    }
    if (entry.type === "webview2" && entry.exclusiveGroup !== "webview2") {
      throw new Error(`${entry.id} lacks the shared WebView2 exclusive group`);
    }
  }
  for (const entry of preflights) {
    if (!existsSync(resolve(testingRoot, entry.path))) throw new Error(`${entry.id} path is missing: ${entry.path}`);
  }
  validateCoverage();
  topologicalOrder(cases);
}

function validateCoverage() {
  const owned = new Map();
  const own = (path, owner) => {
    const normalized = path.replaceAll("\\", "/");
    const previous = owned.get(normalized);
    if (previous) throw new Error(`suite source has two owners: ${normalized} (${previous}, ${owner})`);
    owned.set(normalized, owner);
  };
  for (const entry of cases) {
    own(entry.path, entry.id);
    for (const source of entry.sources ?? []) own(source, entry.id);
  }
  for (const entry of preflights) own(entry.path, entry.id);
  for (const source of supportSources) own(source, "support");

  const candidates = [
    ...walk(join(testingRoot, "cases")).filter((path) => path.endsWith(".test.ts") || path.endsWith(".test.mjs") || path.endsWith(".webview2.mjs")),
    ...walk(join(testingRoot, "checks")).filter((path) => /^verify.*\.mjs$/.test(relative(join(testingRoot, "checks"), path))),
  ].map((path) => relative(testingRoot, path).split(sep).join("/"));
  for (const path of candidates) {
    if (!owned.has(path)) throw new Error(`orphan simulator test/check: ${path}`);
  }
  for (const path of owned.keys()) {
    if ((path.startsWith("cases/") || path.startsWith("checks/")) && !candidates.includes(path)) {
      if (!supportSources.includes(path)) throw new Error(`manifest owns a non-case path unexpectedly: ${path}`);
    }
  }
}

function printList() {
  const rows = [...cases].sort((left, right) => left.capability.localeCompare(right.capability) || left.id.localeCompare(right.id));
  for (const capability of capabilities) {
    const group = rows.filter((entry) => entry.capability === capability);
    if (group.length === 0) continue;
    console.log(`\n${capability}`);
    for (const entry of group) {
      console.log(`  ${entry.id} [${entry.type}; ${entry.profiles.join(",") || "opt-in"}; ${entry.authority}]`);
    }
  }
  console.log(`\nmanifest verified: cases=${cases.length} preflights=${preflights.length} profiles=${profiles.length}`);
}

function substitute(value) {
  return substitutions.get(value) ?? value;
}

function parseArguments(args) {
  let profile = "development";
  let capability = null;
  let caseId = null;
  let list = false;
  let cleanBrowserBuild = false;
  let trailingArguments = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      trailingArguments = args.slice(index + 1);
      break;
    }
    if (arg === "--profile") profile = requiredValue(args, ++index, arg);
    else if (arg === "--capability") capability = requiredValue(args, ++index, arg);
    else if (arg === "--case") caseId = requiredValue(args, ++index, arg);
    else if (arg === "--list") list = true;
    else if (arg === "--clean-browser-build") cleanBrowserBuild = true;
    else throw new Error(`unknown suite option: ${arg}`);
  }
  if (!profiles.includes(profile)) throw new Error(`unknown profile: ${profile}`);
  if (capability !== null && !capabilities.includes(capability)) throw new Error(`unknown capability: ${capability}`);
  if (capability !== null && caseId !== null) throw new Error("--capability and --case are mutually exclusive");
  return { profile, capability, caseId, list, cleanBrowserBuild, trailingArguments };
}

function requiredValue(args, index, option) {
  const value = args[index];
  if (typeof value !== "string" || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}

function* walk(root) {
  if (!statSafe(root)?.isDirectory()) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

function statSafe(path) {
  try { return statSync(path); } catch { return null; }
}
