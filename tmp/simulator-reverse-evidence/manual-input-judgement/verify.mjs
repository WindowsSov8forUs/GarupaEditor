import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(packageRoot, "../../..");
const manifest = JSON.parse(readFileSync(resolve(packageRoot, "manifest.json"), "utf8"));
const sourceRoot = manifest.source.repository;
const validateIndex = process.argv.includes("--index");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function git(args, cwd, encoding = "utf8") {
  return execFileSync("git", args, { cwd, encoding, maxBuffer: 128 * 1024 * 1024 });
}

function fail(message) {
  throw new Error(message);
}

function checkBytes(label, bytes, entry) {
  if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) {
    fail(`${label} bytes/hash mismatch`);
  }
}

if (manifest.schemaVersion !== 1 || manifest.entries.length !== 106) {
  fail("Unexpected manual static manifest shape");
}
if (
  manifest.source.manualStaticEvidenceCommit !==
  "11b8250853ca12a2106c66245724467701d9eb23"
) {
  fail("Unexpected Reverse manual static commit");
}
if (
  manifest.sample.package !== "jp.co.craftegg.band" ||
  manifest.sample.versionName !== "10.1.4" ||
  manifest.sample.versionCode !== 230 ||
  manifest.sample.abi !== "arm64-v8a" ||
  manifest.sample.libil2cppSha256 !==
    "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F"
) {
  fail("Unexpected manual-input sample identity");
}
const gate = manifest.manualInputEvidenceGate;
if (
  gate.status !== "partial-static-closed-runtime-blocked" ||
  gate.closedFindings.join(",") !== "V01,D01,D02" ||
  gate.blockingFindings.join(",") !==
    "D03,D04,D05,D06,D07,D08,D09,D10,D11,D12,D13,D14,D15"
) {
  fail("Manual evidence gate status changed");
}

git(["cat-file", "-e", `${manifest.source.manualStaticEvidenceCommit}^{commit}`], sourceRoot);
const ids = new Set();
for (const entry of manifest.entries) {
  if (ids.has(entry.id)) fail(`Duplicate evidence id: ${entry.id}`);
  ids.add(entry.id);
  if (
    entry.sourcePath.startsWith("runtime/tools/") ||
    entry.copiedPath.startsWith("runtime/tools/") ||
    !entry.sourcePath.startsWith(
      "artifacts/investigations/manual-input-runtime-contract-10-1-4/",
    )
  ) {
    fail(`Forbidden or foreign evidence path: ${entry.id}`);
  }
  const copied = readFileSync(resolve(packageRoot, entry.copiedPath));
  checkBytes(`${entry.id} copied`, copied, entry);
  const source = git(
    ["show", `${entry.sourceCommit}:${entry.sourcePath}`],
    sourceRoot,
    null,
  );
  checkBytes(`${entry.id} source`, source, entry);
  if (validateIndex) {
    const indexPath = relative(projectRoot, resolve(packageRoot, entry.copiedPath))
      .split(sep)
      .join("/");
    const indexed = git(["show", `:${indexPath}`], projectRoot, null);
    checkBytes(`${entry.id} index`, indexed, entry);
  }
}

const investigation = resolve(
  packageRoot,
  "artifacts/investigations/manual-input-runtime-contract-10-1-4",
);
const contract = JSON.parse(
  readFileSync(resolve(investigation, "manual_input_static_contract.json"), "utf8"),
);
if (
  contract.method_status_counts.mapped !== 99 ||
  contract.layout_status_counts.unchanged !== 12 ||
  contract.enum_status_counts.unchanged !== 8
) {
  fail("Frozen static contract counts changed");
}
if (
  contract.methods.some(
    (entry) =>
      entry.status !== "mapped" ||
      !entry.signature_unchanged ||
      entry.baseline_size !== entry.target_size,
  )
) {
  fail("Frozen method migration is incomplete");
}
const methods = new Map(
  contract.methods.map((entry) => [`${entry.owner}.${entry.method}`, entry]),
);
if (
  methods.get("NoteSlide.WaitState")?.target_rva !== "0x321B414" ||
  methods.get("NoteSlide.WaitState")?.target_end_rva !== "0x321B628" ||
  methods.get("NoteSlide.execOverWaitState")?.target_rva !== "0x321B628" ||
  methods.get("NoteSlide.execOverWaitState")?.target_end_rva !== "0x321B69C" ||
  methods.get("NoteSlide.WaitState")?.target_sha256 ===
    methods.get("NoteSlide.execOverWaitState")?.target_sha256
) {
  fail("Frozen Slide Wait boundaries are not independent");
}
const closure = JSON.parse(readFileSync(resolve(investigation, "closure.json"), "utf8"));
if (
  closure.gates.version_rebaseline !== "closed" ||
  closure.gates.slide_wait_boundary !== "closed" ||
  closure.gates.type_layout_and_enums !== "closed" ||
  closure.gates.runtime_oracle !== "blocked" ||
  closure.gates.manual_input_gate !== "blocked"
) {
  fail("Frozen static closure scope changed");
}

console.log(
  `manual-input evidence verified: static=99/12/8 V01/D01/D02=closed ` +
    `runtime=D03-D15-blocked entries=${manifest.entries.length} ` +
    `index=${validateIndex ? "checked" : "skipped"}`,
);
