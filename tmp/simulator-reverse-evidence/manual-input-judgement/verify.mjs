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
const investigation = resolve(
  packageRoot,
  "artifacts/investigations/manual-input-runtime-contract-10-1-4",
);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}
function git(args, cwd, encoding = "utf8") {
  return execFileSync("git", args, { cwd, encoding, maxBuffer: 256 * 1024 * 1024 });
}
function fail(message) {
  throw new Error(message);
}
function check(condition, message) {
  if (!condition) fail(message);
}
function checkBytes(label, bytes, entry) {
  check(bytes.length === entry.bytes && sha256(bytes) === entry.sha256, `${label} bytes/hash mismatch`);
}
function json(path) {
  return JSON.parse(readFileSync(resolve(investigation, path), "utf8"));
}

check(manifest.schemaVersion === 2 && manifest.entries.length === 140, "Unexpected manual manifest shape");
check(
  manifest.source.finalManualEvidenceCommit ===
    "1432b7def25faafee4cc713423305d2c1fb7def4",
  "Unexpected final Reverse evidence commit",
);
check(
  manifest.sample.package === "jp.co.craftegg.band" &&
    manifest.sample.versionName === "10.1.4" &&
    manifest.sample.versionCode === 230 &&
    manifest.sample.abi === "arm64-v8a" &&
    manifest.sample.libil2cppSha256 ===
      "815DF62582B35F3EF2223AB033FAC6DC909DE492D548DD28950BF1F98F058D8F",
  "Unexpected manual-input sample identity",
);
const gate = manifest.manualInputEvidenceGate;
check(
  gate.status === "closed" &&
    gate.closedFindings.join(",") ===
      "V01,D01,D02,D03,D04,D05,D06,D07,D08,D09,D10,D11,D12,D13,D14,D15" &&
    gate.blockingFindings.length === 0 &&
    gate.requiredBeforeTasks.length === 0,
  "Manual-input evidence gate is not closed",
);
check(
  manifest.counts.methods === 117 &&
    manifest.counts.layouts === 14 &&
    manifest.counts.enums === 13 &&
    manifest.counts.r1Traces === 5 &&
    manifest.counts.fixedEventCases === 26,
  "Manual evidence counts changed",
);

git(["cat-file", "-e", `${manifest.source.finalManualEvidenceCommit}^{commit}`], sourceRoot);
const ids = new Set();
for (const entry of manifest.entries) {
  check(!ids.has(entry.id), `Duplicate evidence id: ${entry.id}`);
  ids.add(entry.id);
  check(
    !entry.sourcePath.startsWith("runtime/tools/") &&
      !entry.copiedPath.startsWith("runtime/tools/") &&
      entry.sourcePath.startsWith(
        "artifacts/investigations/manual-input-runtime-contract-10-1-4/",
      ),
    `Forbidden or foreign evidence path: ${entry.id}`,
  );
  const copied = readFileSync(resolve(packageRoot, entry.copiedPath));
  checkBytes(`${entry.id} copied`, copied, entry);
  const source = git(["show", `${entry.sourceCommit}:${entry.sourcePath}`], sourceRoot, null);
  checkBytes(`${entry.id} source`, source, entry);
  if (validateIndex) {
    const indexPath = relative(projectRoot, resolve(packageRoot, entry.copiedPath))
      .split(sep)
      .join("/");
    const indexed = git(["show", `:${indexPath}`], projectRoot, null);
    checkBytes(`${entry.id} index`, indexed, entry);
  }
}

const contract = json("manual_input_static_contract.json");
check(
  contract.method_status_counts.mapped === 117 &&
    contract.layout_status_counts.unchanged === 14 &&
    contract.enum_status_counts.unchanged === 13,
  "Frozen static contract counts changed",
);
check(
  contract.methods.every(
    (entry) =>
      entry.status === "mapped" &&
      entry.signature_unchanged &&
      entry.baseline_size === entry.target_size,
  ),
  "Frozen method migration is incomplete",
);
const methods = new Map(contract.methods.map((entry) => [`${entry.owner}.${entry.method}`, entry]));
check(
  methods.get("NoteSlide.WaitState")?.target_rva === "0x321B414" &&
    methods.get("NoteSlide.WaitState")?.target_end_rva === "0x321B628" &&
    methods.get("NoteSlide.execOverWaitState")?.target_rva === "0x321B628" &&
    methods.get("NoteSlide.execOverWaitState")?.target_end_rva === "0x321B69C" &&
    methods.get("NoteSlide.WaitState")?.target_sha256 !==
      methods.get("NoteSlide.execOverWaitState")?.target_sha256,
  "Frozen Slide Wait boundaries are not independent",
);
check(methods.get("NoteSlide..ctor")?.target_rva === "0x321F674", "Slide constructor evidence missing");
check(
  methods.get("NoteSingleBase.MoveState")?.target_rva === "0x30E07DC" &&
    methods.get("NoteFlickBase.WaitState")?.target_rva === "0x3A76878" &&
    methods.get("NoteFlickBase.ExecTouchBegan")?.target_rva === "0x3A768C0" &&
    methods.get("NoteFlickBase.ExecTouchBegan")?.target_end_rva === "0x3A76908",
  "Single/Flick lifecycle-owner evidence missing",
);

const closure = json("closure.json");
check(
  closure.gates.version_rebaseline === "closed" &&
    closure.gates.slide_wait_boundary === "closed" &&
    closure.gates.type_layout_and_enums === "closed" &&
    closure.gates.runtime_oracle === "closed" &&
    closure.gates.manual_input_gate === "closed" &&
    closure.blocking_findings.length === 0 &&
    Object.keys(closure.gap_resolution).length === 16,
  "Frozen manual closure is incomplete",
);

const oracle = json("manual_input_fixed_event_oracle.json");
check(
  oracle.status === "confirmed-10.1.4-fixed-event-oracle-static-plus-r1" &&
    oracle.cases.length === 26 &&
    oracle.runtime_observations.length === 5 &&
    oracle.cases.every((entry, index) => entry.case_id === `MJ${String(index + 1).padStart(2, "0")}`) &&
    oracle.cases.every((entry) => entry.unknown_fields.length === 0),
  "Frozen MJ01-MJ26 oracle is incomplete",
);
check(
  oracle.input_facts.frame_rate_bits === "0x3C888889" &&
    oracle.input_facts.miss_interval_bits === "0x3E5DDDDE" &&
    oracle.input_facts.flick_threshold_bits === "0x3D23D70A" &&
    oracle.input_facts.directional_threshold_bits === "0x3C23D70A",
  "Manual Float32 facts changed",
);
check(
  oracle.chart_samples.song_id === 653 &&
    oracle.chart_samples.difficulties.easy.runtime_bms_sha256 ===
      "4C2F8D202DED5DFD9C4144C0FE000B1E3524E0F25D3FEAF4DD102413F6CD6325" &&
    oracle.chart_samples.difficulties.hard.text_asset_sha256 ===
      "86382CF8C16B8992A72EA93FBE7409022FA8590E284C65F3796668E4DD3FEB0F" &&
    oracle.chart_samples.difficulties.expert.text_asset_sha256 ===
      "CC4C38FA4DE47767CF1C1605C716D8DD8868D4FBD86844D375B134F34BB02740",
  "Manual chart identities changed",
);

const runtimeRows = [
  ["runtime/easy-play-plan.json", "runtime/easy-play.json", "capture_manual_input_runtime.py"],
  ["runtime/expert-timeout-plan.json", "runtime/expert-timeout.json", "capture_manual_input_runtime.py"],
  ["runtime/hard-touch-plan.json", "runtime/hard-touch.json", "capture_manual_input_runtime.py"],
  ["runtime/hard-timeout-plan.json", "runtime/hard-timeout.json", "capture_manual_input_runtime.py"],
  ["runtime/ui-multitouch-plan.json", "runtime/ui-multitouch.json", "capture_manual_multitouch_runtime.py"],
];
const traces = new Map();
for (const [planPath, tracePath, scriptPath] of runtimeRows) {
  const planBytes = readFileSync(resolve(investigation, planPath));
  const scriptBytes = readFileSync(resolve(investigation, scriptPath));
  const trace = json(tracePath);
  check(
    trace.status === "confirmed-r1-observation-only" &&
      trace.capture_error === null &&
      trace.plan_sha256 === sha256(planBytes) &&
      trace.capture_script_sha256 === sha256(scriptBytes) &&
      trace.events.every((event, index) => event.sequence === index),
    `Invalid frozen R1 trace: ${tracePath}`,
  );
  traces.set(tracePath, trace);
  const oracleEntry = oracle.runtime_observations.find((entry) => entry.path === tracePath);
  check(oracleEntry?.sha256 === sha256(readFileSync(resolve(investigation, tracePath))), `Oracle trace hash mismatch: ${tracePath}`);
}

const hardTouchKinds = new Set(traces.get("runtime/hard-touch.json").events.map((entry) => entry.kind));
check(
  hardTouchKinds.has("NoteLong.ExecTouchBegan.enter") &&
    hardTouchKinds.has("NoteLong.ExecTouchEnded.enter"),
  "Long physical R1 lifecycle missing",
);
const hardTimeout = traces.get("runtime/hard-timeout.json");
check(
  hardTimeout.events.filter((entry) => entry.kind === "NoteLong.onMiss.enter").length === 2,
  "Long double timeout missing",
);
const expert = traces.get("runtime/expert-timeout.json");
check(
  expert.events.filter((entry) => entry.kind === "NoteSlide.onMiss.enter").length === 2 &&
    expert.events.filter((entry) => entry.kind === "NoteSlide.onMissAfterNote.enter").length === 1,
  "Slide root/after timeout missing",
);
const multi = traces.get("runtime/ui-multitouch.json");
const multiPhases = new Map([[0, new Set()], [1, new Set()]]);
for (const entry of multi.events.filter((event) => event.kind === "Touch.get_phase")) {
  multiPhases.get(entry.touch.finger_id)?.add(entry.touch.phase);
}
check(
  [0, 1].every((finger) => [0, 1, 2, 3].every((phase) => multiPhases.get(finger).has(phase))),
  "Two-finger R1 phase matrix missing",
);

console.log(
  `manual-input evidence verified: methods=117 layouts=14 enums=13 ` +
    `R1=5 MJ=26 gaps=V01,D01-D15 gate=closed entries=${manifest.entries.length} ` +
    `index=${validateIndex ? "checked" : "skipped"}`,
);
