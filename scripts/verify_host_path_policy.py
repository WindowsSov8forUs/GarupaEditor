#!/usr/bin/env python3
"""Fail closed when Git objects contain host-specific absolute paths.

The scanner reads Git objects rather than walking the Windows worktree.  It supports the current
index, staged changes, and an explicit frozen ref ledger.  Reports intentionally redact matched
values: only the tracked path, object identity, location, category, and a match digest are kept.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import lzma
import os
import re
import subprocess
import sys
import tarfile
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence


ROOT = Path(__file__).resolve().parents[1]
MAX_CONTAINER_DEPTH = 4
MAX_EXPANDED_BYTES = 1024 * 1024 * 1024
MAX_CONTAINER_ENTRIES = 100_000
LFS_POINTER = re.compile(
    rb"\Aversion https://git-lfs\.github\.com/spec/v1\r?\n"
    rb"oid sha256:([0-9a-f]{64})\r?\nsize ([0-9]+)\r?\n?\Z"
)

# A root is sufficient to prove that a host path is present.  Keeping the match bounded to the
# root also prevents reports from persisting user names or local directory names.
HOST_SEGMENT_TEXT = r"[a-z0-9_ .@$()+~=-]{2,}"
HOST_SEGMENT_BYTES = rb"[a-z0-9_ .@$()+~=-]{2,}"
HOST_LONG_SEGMENT_BYTES = rb"[a-z0-9_ .@$()+~=-]{8,}"
# Binary path roots must carry either one substantial component or two ordinary components.
# This catches raw paths embedded in object/debug metadata without treating an arbitrary
# five-byte drive-like sequence as sufficient evidence.
BINARY_DRIVE_TAIL = (
    rb"(?:" + HOST_LONG_SEGMENT_BYTES + rb"|" + HOST_SEGMENT_BYTES + rb"[\\/]" + HOST_SEGMENT_BYTES + rb")"
    rb"(?:[\\/]" + HOST_SEGMENT_BYTES + rb")*"
)
BINARY_PATH_TAIL = HOST_SEGMENT_BYTES + rb"(?:[\\/]" + HOST_SEGMENT_BYTES + rb")*"
TEXT_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("file-uri", re.compile(rf"(?i)file:/+[a-z]:(?:[\\/]+){HOST_SEGMENT_TEXT}")),
    (
        "windows-extended-drive",
        re.compile(rf"(?i)(?<![a-z0-9+.-])(?:\\{{2,}}\\?\\)[a-z]:(?:[\\/]+){HOST_SEGMENT_TEXT}"),
    ),
    (
        "windows-drive",
        re.compile(rf"(?i)(?<![a-z0-9+.-])[a-z]:(?:[\\/]+){HOST_SEGMENT_TEXT}"),
    ),
    (
        "windows-unc",
        re.compile(r"(?i)(?<![a-z0-9])\\{2,}[a-z0-9][a-z0-9._$-]+[\\/]+[a-z0-9][a-z0-9._$-]+(?:[\\/]+)?"),
    ),
    ("posix-home", re.compile(r"(?i)/(?:home|users)/[^/\\\s\"']+/")),
    ("wsl-drive", re.compile(rf"(?i)/(?:mnt|cygdrive)/[a-z]/{HOST_SEGMENT_TEXT}")),
)
BYTE_PATTERNS: tuple[tuple[str, re.Pattern[bytes]], ...] = (
    ("file-uri", re.compile(rb"(?i)file:/+[a-z]:(?:[\\/]+)" + BINARY_DRIVE_TAIL)),
    (
        "windows-extended-drive",
        re.compile(rb"(?i)(?<![a-z0-9+.-])(?:\\{2,}\\?\\)[a-z]:(?:[\\/]+)" + BINARY_DRIVE_TAIL),
    ),
    ("windows-drive", re.compile(rb"(?i)(?<![a-z0-9+.-])[a-z]:(?:[\\/]+)" + BINARY_DRIVE_TAIL)),
    (
        "windows-unc",
        re.compile(
            rb"(?i)(?<![a-z0-9])\\{2,}[a-z0-9][a-z0-9._$-]+[\\/]+[a-z0-9][a-z0-9._$-]+"
            rb"(?:[\\/]" + HOST_SEGMENT_BYTES + rb")*"
        ),
    ),
    ("posix-home", re.compile(rb"(?i)/(?:home|users)/[^/\\\s\"']+/(?:" + BINARY_PATH_TAIL + rb")?")),
    ("wsl-drive", re.compile(rb"(?i)/(?:mnt|cygdrive)/[a-z]/" + BINARY_PATH_TAIL)),
)
CONTAINER_SUFFIXES = (".gz", ".gzip", ".zip", ".tar", ".xz")

# Every forbidden scalar form contains one of these roots. Rejecting blobs without a root before
# UTF decoding avoids repeatedly walking multi-gigabyte historical generated tables. Build the
# backslash forms at runtime so the policy source does not itself persist a path-shaped test value.
_HOST_ROOT_TEXT = (
    "file:" + "/",
    ":" + "/",
    ":" + chr(92),
    chr(92) * 2,
    "/home/",
    "/users/",
    "/mnt/",
    "/cygdrive/",
)
# The ASCII prefilter includes enough root context to reject URL schemes before scanning a
# potentially large binary. The previous generic `:/` trigger made every embedded https URL walk
# the complete Rust artifact even though the drive classifier's lookbehind would later reject it.
ASCII_HOST_ROOT = re.compile(
    rb"(?:"
    + rb"file:" + rb"/+" + rb"[a-z]:[\\/]"
    + rb"|(?<![a-z0-9+.-])[a-z]:[\\/]"
    + rb"|\\{2,}[a-z0-9]"
    + rb"|/" + rb"(?:home|users)" + rb"/"
    + rb"|/" + rb"(?:mnt|cygdrive)" + rb"/[a-z]/"
    + rb")",
    re.IGNORECASE,
)
UTF16_HOST_ROOT = re.compile(
    b"(?:"
    + b"|".join(
        re.escape(value.encode(encoding))
        for value in _HOST_ROOT_TEXT
        for encoding in ("utf-16le", "utf-16be")
    )
    + b")",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Entry:
    mode: str
    oid: str
    path: str


@dataclass(frozen=True)
class ObjectRecord:
    oid: str
    object_type: str
    size: int
    data: bytes


def git_bytes(*args: str, input_data: bytes | None = None, check: bool = True) -> bytes:
    env = os.environ.copy()
    env["GIT_OPTIONAL_LOCKS"] = "0"
    result = subprocess.run(
        ["git", "-C", str(ROOT), *args],
        input=input_data,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        check=False,
    )
    if check and result.returncode:
        detail = result.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"git {' '.join(args)} failed ({result.returncode}): {detail}")
    return result.stdout


def match_row(
    *,
    category: str,
    encoding: str,
    offset: int,
    line: int | None,
    column: int | None,
    value: bytes,
    source: str,
) -> dict[str, object]:
    return {
        "category": category,
        "encoding": encoding,
        "offset": offset,
        "line": line,
        "column": column,
        "matchLength": len(value),
        "matchSha256": hashlib.sha256(value).hexdigest().upper(),
        "summary": f"{category}:redacted-root",
        "source": source,
    }


def text_location(text: str, offset: int) -> tuple[int, int]:
    line = text.count("\n", 0, offset) + 1
    previous = text.rfind("\n", 0, offset)
    return line, offset - previous


def byte_location(data: bytes, offset: int) -> tuple[int, int]:
    line = data.count(b"\n", 0, offset) + 1
    previous = data.rfind(b"\n", 0, offset)
    return line, offset - previous


def scan_text(text: str, encoding: str, source: str) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for category, pattern in TEXT_PATTERNS:
        for match in pattern.finditer(text):
            line, column = text_location(text, match.start())
            value = match.group(0).encode("utf-8", errors="surrogatepass")
            rows.append(
                match_row(
                    category=category,
                    encoding=encoding,
                    offset=match.start(),
                    line=line,
                    column=column,
                    value=value,
                    source=source,
                )
            )
    return rows


def printable_ratio(text: str) -> float:
    if not text:
        return 1.0
    printable = sum(character.isprintable() or character in "\r\n\t" for character in text)
    return printable / len(text)


def scan_scalar_bytes(data: bytes, source: str) -> list[dict[str, object]]:
    if ASCII_HOST_ROOT.search(data) is None and UTF16_HOST_ROOT.search(data) is None:
        return []
    rows: list[dict[str, object]] = []
    decoded: list[tuple[str, str]] = []
    try:
        utf8 = data.decode("utf-8")
    except UnicodeDecodeError:
        utf8 = ""
    text_like_utf8 = bool(utf8) and printable_ratio(utf8) >= 0.70
    if text_like_utf8:
        decoded.append(("utf-8", utf8))
    else:
        # Invalid/binary blobs are searched only inside substantial printable ASCII runs.  This
        # preserves raw-ASCII coverage (for example PDB strings) without interpreting arbitrary
        # compressed/image bytes as short drive roots.
        for run in re.finditer(rb"[\x20-\x7e\t\r\n]{8,}", data):
            run_data = run.group(0)
            for category, pattern in BYTE_PATTERNS:
                for match in pattern.finditer(run_data):
                    absolute_offset = run.start() + match.start()
                    # Raw binary offsets are authoritative. Re-counting every preceding newline
                    # for thousands of embedded paths makes one blob O(matches * bytes) and caused
                    # a 36 MiB object to take ~42 seconds. Line/column are intentionally omitted
                    # for binary payloads; the byte offset remains exact and redacted reports do
                    # not need a synthetic text coordinate.
                    rows.append(
                        match_row(
                            category=category,
                            encoding="raw-ascii",
                            offset=absolute_offset,
                            line=None,
                            column=None,
                            value=match.group(0),
                            source=source,
                        )
                    )

    even = data[0::2]
    odd = data[1::2]
    even_null_ratio = even.count(b"\x00") / len(even) if even else 0.0
    odd_null_ratio = odd.count(b"\x00") / len(odd) if odd else 0.0
    has_utf16_shape = data.startswith((b"\xff\xfe", b"\xfe\xff")) or (
        max(even_null_ratio, odd_null_ratio) >= 0.60
        and min(even_null_ratio, odd_null_ratio) <= 0.20
    )
    if has_utf16_shape:
        for encoding in ("utf-16", "utf-16le", "utf-16be"):
            try:
                text = data.decode(encoding)
            except (UnicodeDecodeError, UnicodeError):
                continue
            if text and printable_ratio(text) >= 0.70:
                decoded.append((encoding, text))

    for encoding, text in decoded:
        rows.extend(scan_text(text, encoding, source))

    unique: dict[tuple[object, ...], dict[str, object]] = {}
    for row in rows:
        key = (
            row["category"],
            row["offset"],
            row["line"],
            row["column"],
            row["matchSha256"],
            row["source"],
        )
        unique[key] = row
    return list(unique.values())


def bounded_read(stream: object, limit: int = MAX_EXPANDED_BYTES) -> bytes:
    data = stream.read(limit + 1)  # type: ignore[attr-defined]
    if len(data) > limit:
        raise ValueError(f"expanded content exceeds {limit} bytes")
    return data


def looks_like_tar(data: bytes) -> bool:
    return len(data) >= 512 and data[257:263] in (b"ustar\x00", b"ustar ")


def container_kind(data: bytes) -> str | None:
    if data.startswith(b"\x1f\x8b"):
        return "gzip"
    if data.startswith(b"PK\x03\x04") or data.startswith(b"PK\x05\x06") or data.startswith(b"PK\x07\x08"):
        return "zip"
    if data.startswith(b"\xfd7zXZ\x00"):
        return "xz"
    if looks_like_tar(data):
        return "tar"
    return None


def scan_payload(
    data: bytes,
    *,
    source: str,
    depth: int = 0,
) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    rows = scan_scalar_bytes(data, source)
    errors: list[dict[str, object]] = []
    kind = container_kind(data)
    if kind is None:
        return rows, errors
    if depth >= MAX_CONTAINER_DEPTH:
        errors.append({"category": "container-depth", "source": source, "detail": "expansion depth exceeded"})
        return rows, errors

    try:
        if kind == "gzip":
            with gzip.GzipFile(fileobj=io.BytesIO(data), mode="rb") as stream:
                expanded = bounded_read(stream)
            nested, nested_errors = scan_payload(expanded, source=f"{source}!gzip", depth=depth + 1)
            rows.extend(nested)
            errors.extend(nested_errors)
        elif kind == "xz":
            with lzma.LZMAFile(io.BytesIO(data), mode="rb") as stream:
                expanded = bounded_read(stream)
            nested, nested_errors = scan_payload(expanded, source=f"{source}!xz", depth=depth + 1)
            rows.extend(nested)
            errors.extend(nested_errors)
        elif kind == "zip":
            total = 0
            with zipfile.ZipFile(io.BytesIO(data), mode="r") as archive:
                infos = archive.infolist()
                if len(infos) > MAX_CONTAINER_ENTRIES:
                    raise ValueError("zip entry count exceeds policy bound")
                for info in infos:
                    name_source = f"{source}!zip-name"
                    rows.extend(scan_scalar_bytes(info.filename.encode("utf-8", errors="surrogatepass"), name_source))
                    if info.flag_bits & 0x1:
                        raise ValueError("encrypted zip entry is not auditable")
                    if info.is_dir():
                        continue
                    total += info.file_size
                    if total > MAX_EXPANDED_BYTES:
                        raise ValueError("zip expanded size exceeds policy bound")
                    with archive.open(info, mode="r") as stream:
                        payload = bounded_read(stream, min(MAX_EXPANDED_BYTES, info.file_size + 1))
                    nested, nested_errors = scan_payload(
                        payload,
                        source=f"{source}!zip:{hashlib.sha256(info.filename.encode('utf-8', errors='surrogatepass')).hexdigest()[:16]}",
                        depth=depth + 1,
                    )
                    rows.extend(nested)
                    errors.extend(nested_errors)
        elif kind == "tar":
            total = 0
            with tarfile.open(fileobj=io.BytesIO(data), mode="r:") as archive:
                members = archive.getmembers()
                if len(members) > MAX_CONTAINER_ENTRIES:
                    raise ValueError("tar entry count exceeds policy bound")
                for member in members:
                    rows.extend(
                        scan_scalar_bytes(
                            member.name.encode("utf-8", errors="surrogatepass"),
                            f"{source}!tar-name",
                        )
                    )
                    if member.issym() or member.islnk():
                        rows.extend(
                            scan_scalar_bytes(
                                member.linkname.encode("utf-8", errors="surrogatepass"),
                                f"{source}!tar-link",
                            )
                        )
                        continue
                    if not member.isfile():
                        continue
                    total += member.size
                    if total > MAX_EXPANDED_BYTES:
                        raise ValueError("tar expanded size exceeds policy bound")
                    stream = archive.extractfile(member)
                    if stream is None:
                        raise ValueError("tar member cannot be read")
                    with stream:
                        payload = bounded_read(stream, min(MAX_EXPANDED_BYTES, member.size + 1))
                    nested, nested_errors = scan_payload(
                        payload,
                        source=f"{source}!tar:{hashlib.sha256(member.name.encode('utf-8', errors='surrogatepass')).hexdigest()[:16]}",
                        depth=depth + 1,
                    )
                    rows.extend(nested)
                    errors.extend(nested_errors)
    except (OSError, EOFError, ValueError, gzip.BadGzipFile, lzma.LZMAError, zipfile.BadZipFile, tarfile.TarError) as exc:
        errors.append({"category": "container-unreadable", "source": source, "detail": str(exc)})
    return rows, errors


def parse_index() -> list[Entry]:
    raw = git_bytes("ls-files", "--stage", "-z")
    entries: list[Entry] = []
    for record in raw.split(b"\x00"):
        if not record:
            continue
        metadata, separator, path_bytes = record.partition(b"\t")
        if not separator:
            raise RuntimeError("malformed index entry")
        mode, oid, stage = metadata.decode("ascii").split()
        if stage != "0":
            raise RuntimeError("unmerged index entry cannot be audited")
        entries.append(Entry(mode=mode, oid=oid, path=path_bytes.decode("utf-8", errors="surrogateescape")))
    return entries


def staged_paths() -> set[str]:
    raw = git_bytes("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z")
    return {
        path.decode("utf-8", errors="surrogateescape")
        for path in raw.split(b"\x00")
        if path
    }


def read_ref_ledger(path: Path) -> dict[str, str]:
    refs: dict[str, str] = {}
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        fields = line.split("\t") if "\t" in line else line.split()
        if len(fields) < 2:
            raise RuntimeError(f"malformed refs ledger line {line_number}")
        if fields[0].startswith("refs/"):
            ref, oid = fields[0], fields[1]
        else:
            oid, ref = fields[0], fields[1]
        if not ref.startswith("refs/") or not re.fullmatch(r"[0-9a-fA-F]{40,64}", oid):
            raise RuntimeError(f"invalid refs ledger line {line_number}")
        if ref.endswith("^{}"):
            continue
        refs[ref] = oid.lower()
    if not refs:
        raise RuntimeError("refs ledger is empty")
    return refs


def storage_order(oids: Iterable[str]) -> list[str]:
    requested = set(oids)
    if not requested:
        return []
    storage_inventory = git_bytes(
        "cat-file",
        "--batch-check=%(objectname)",
        "--batch-all-objects",
        "--unordered",
    )
    ordered = [
        oid
        for oid in storage_inventory.decode("ascii").splitlines()
        if oid in requested
    ]
    if len(ordered) != len(requested) or set(ordered) != requested:
        raise RuntimeError("storage-order object inventory does not cover the requested objects")
    return ordered


def history_inventory(refs: dict[str, str]) -> tuple[list[str], dict[str, set[str]], dict[str, set[str]]]:
    all_objects: dict[str, None] = {}
    object_paths: dict[str, set[str]] = {}
    object_refs: dict[str, set[str]] = {}
    for ref, tip in sorted(refs.items()):
        output = git_bytes("rev-list", "--objects", tip)
        reachable: set[str] = {tip}
        for line in output.decode("utf-8", errors="surrogateescape").splitlines():
            oid, separator, path = line.partition(" ")
            reachable.add(oid)
            if separator:
                object_paths.setdefault(oid, set()).add(path)
        for oid in reachable:
            object_refs.setdefault(oid, set()).add(ref)
        for oid in reachable:
            all_objects.setdefault(oid, None)
    return storage_order(all_objects), object_paths, object_refs


def object_records(oids: Sequence[str]) -> Iterable[ObjectRecord]:
    if not oids:
        return
    env = os.environ.copy()
    env["GIT_OPTIONAL_LOCKS"] = "0"
    with tempfile.TemporaryFile() as request_stream:
        request_stream.write("".join(f"{oid}\n" for oid in oids).encode("ascii"))
        request_stream.seek(0)
        process = subprocess.Popen(
            ["git", "-C", str(ROOT), "cat-file", "--batch"],
            stdin=request_stream,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
        )
        assert process.stdout is not None
        for requested_oid in oids:
            header = process.stdout.readline().decode("ascii", errors="replace").rstrip("\n")
            fields = header.split()
            if len(fields) != 3 or fields[1] == "missing":
                process.kill()
                raise RuntimeError(f"missing or malformed Git object: {requested_oid}")
            oid, object_type, size_text = fields
            size = int(size_text)
            data = process.stdout.read(size)
            if len(data) != size or process.stdout.read(1) != b"\n":
                process.kill()
                raise RuntimeError(f"truncated Git object: {requested_oid}")
            yield ObjectRecord(oid=oid, object_type=object_type, size=size, data=data)
        stderr = process.stderr.read() if process.stderr is not None else b""
        return_code = process.wait()
        if return_code:
            raise RuntimeError(stderr.decode("utf-8", errors="replace"))


def object_format_bytes() -> int:
    value = git_bytes("rev-parse", "--show-object-format").decode("ascii").strip()
    if value == "sha1":
        return 20
    if value == "sha256":
        return 32
    raise RuntimeError(f"unsupported Git object format: {value}")


def tree_entry_names(data: bytes, oid_bytes: int) -> list[tuple[str, str]]:
    rows: list[tuple[str, str]] = []
    offset = 0
    while offset < len(data):
        space = data.find(b" ", offset)
        nul = data.find(b"\x00", space + 1)
        if space < 0 or nul < 0 or nul + 1 + oid_bytes > len(data):
            raise RuntimeError("malformed tree object")
        mode = data[offset:space].decode("ascii")
        name = data[space + 1 : nul].decode("utf-8", errors="surrogateescape")
        rows.append((mode, name))
        offset = nul + 1 + oid_bytes
    return rows


def is_local_path(path: str) -> bool:
    normalized = path.replace("\\", "/")
    while normalized.startswith("./"):
        normalized = normalized[2:]
    normalized = normalized.lstrip("/")
    return normalized == ".local" or normalized.startswith(".local/")


def expected_container(path: str) -> str | None:
    lowered = path.lower()
    if lowered.endswith((".gz", ".gzip")):
        return "gzip"
    if lowered.endswith(".zip"):
        return "zip"
    if lowered.endswith(".tar"):
        return "tar"
    if lowered.endswith(".xz"):
        return "xz"
    return None


def find_lfs_payload(oid: str) -> Path:
    common = git_bytes("rev-parse", "--git-common-dir").decode(
        "utf-8", errors="surrogateescape"
    ).strip()
    common_path = Path(common)
    if not common_path.is_absolute():
        common_path = ROOT / common_path
    return common_path / "lfs" / "objects" / oid[:2] / oid[2:4] / oid


def attach_context(
    row: dict[str, object],
    *,
    oid: str | None,
    object_type: str,
    paths: Sequence[str],
    refs: Sequence[str],
) -> list[dict[str, object]]:
    targets = list(paths) or ["<object-message>"]
    attached: list[dict[str, object]] = []
    for path in targets:
        item = dict(row)
        item.update({"path": path, "object": oid, "objectType": object_type, "refs": list(refs)})
        attached.append(item)
    return attached


def scan_entries(
    *,
    entries: Sequence[Entry] | None,
    history_oids: Sequence[str] | None,
    object_paths: dict[str, set[str]],
    object_refs: dict[str, set[str]],
    mode_name: str,
) -> dict[str, object]:
    violations: list[dict[str, object]] = []
    errors: list[dict[str, object]] = []
    entry_by_oid: dict[str, list[Entry]] = {}
    if entries is not None:
        for entry in entries:
            entry_by_oid.setdefault(entry.oid, []).append(entry)
            if is_local_path(entry.path):
                violations.append(
                    {
                        "path": entry.path,
                        "object": entry.oid,
                        "objectType": "index-entry",
                        "refs": [mode_name],
                        "category": "tracked-local",
                        "encoding": "path",
                        "offset": 0,
                        "line": None,
                        "column": None,
                        "matchLength": len(entry.path.encode("utf-8", errors="surrogateescape")),
                        "matchSha256": hashlib.sha256(entry.path.encode("utf-8", errors="surrogateescape")).hexdigest().upper(),
                        "summary": "tracked-local:redacted",
                        "source": "git-path",
                    }
                )
            for row in scan_text(entry.path, "git-path", "git-path"):
                violations.extend(
                    attach_context(
                        row,
                        oid=entry.oid,
                        object_type="index-entry",
                        paths=[entry.path],
                        refs=[mode_name],
                    )
                )
        oids = storage_order(entry_by_oid)
    else:
        oids = list(history_oids or [])

    lfs_cache: dict[str, tuple[list[dict[str, object]], list[dict[str, object]], str | None]] = {}
    oid_bytes = object_format_bytes()
    for record in object_records(oids):
        if entries is not None:
            paths = sorted({entry.path for entry in entry_by_oid.get(record.oid, [])})
            refs = [mode_name]
            modes = {entry.mode for entry in entry_by_oid.get(record.oid, [])}
        else:
            paths = sorted(object_paths.get(record.oid, set()))
            refs = sorted(object_refs.get(record.oid, set()))
            modes = set()

        if record.object_type in {"commit", "tag"}:
            if record.object_type == "commit" and b"\ngpgsig " in b"\n" + record.data:
                errors.append({"category": "signed-object", "object": record.oid, "refs": refs, "detail": "signed commit requires explicit re-signing decision"})
            if record.object_type == "tag" and b"-----BEGIN PGP SIGNATURE-----" in record.data:
                errors.append({"category": "signed-object", "object": record.oid, "refs": refs, "detail": "signed tag requires explicit re-signing decision"})
            rows, payload_errors = scan_payload(record.data, source=f"git-{record.object_type}")
            for row in rows:
                violations.extend(attach_context(row, oid=record.oid, object_type=record.object_type, paths=paths, refs=refs))
            for error in payload_errors:
                errors.append({**error, "object": record.oid, "refs": refs})
            continue

        if record.object_type == "tree":
            try:
                names = tree_entry_names(record.data, oid_bytes)
            except RuntimeError as exc:
                errors.append({"category": "tree-unreadable", "object": record.oid, "refs": refs, "detail": str(exc)})
                continue
            base = paths[0] if paths else ""
            for _, name in names:
                full_path = f"{base}/{name}".lstrip("/")
                if is_local_path(full_path):
                    violations.append(
                        {
                            "path": full_path,
                            "object": record.oid,
                            "objectType": "tree",
                            "refs": refs,
                            "category": "tracked-local",
                            "encoding": "tree-name",
                            "offset": 0,
                            "line": None,
                            "column": None,
                            "matchLength": len(name.encode("utf-8", errors="surrogateescape")),
                            "matchSha256": hashlib.sha256(name.encode("utf-8", errors="surrogateescape")).hexdigest().upper(),
                            "summary": "tracked-local:redacted",
                            "source": "tree-entry",
                        }
                    )
                for row in scan_text(name, "tree-name", "tree-entry"):
                    violations.extend(attach_context(row, oid=record.oid, object_type="tree", paths=[full_path], refs=refs))
            continue

        if record.object_type != "blob":
            continue

        rows, payload_errors = scan_payload(record.data, source="git-blob")
        for row in rows:
            violations.extend(attach_context(row, oid=record.oid, object_type="blob", paths=paths, refs=refs))
        for error in payload_errors:
            errors.append({**error, "object": record.oid, "refs": refs, "paths": paths})

        pointer = LFS_POINTER.fullmatch(record.data)
        if pointer is None:
            actual_kind = container_kind(record.data)
            for path in paths:
                required_kind = expected_container(path)
                if required_kind is not None and actual_kind != required_kind:
                    errors.append(
                        {
                            "category": "container-mismatch",
                            "object": record.oid,
                            "refs": refs,
                            "paths": [path],
                            "detail": f"suffix requires {required_kind}, detected {actual_kind or 'none'}",
                        }
                    )
        else:
            lfs_oid = pointer.group(1).decode("ascii")
            lfs_size = int(pointer.group(2))
            if lfs_oid not in lfs_cache:
                payload_path = find_lfs_payload(lfs_oid)
                if not payload_path.is_file():
                    lfs_cache[lfs_oid] = (
                        [],
                        [{"category": "lfs-missing", "detail": "reachable LFS payload is unavailable"}],
                        None,
                    )
                else:
                    payload = payload_path.read_bytes()
                    payload_errors_local: list[dict[str, object]] = []
                    if len(payload) != lfs_size:
                        payload_errors_local.append({"category": "lfs-size", "detail": "reachable LFS payload size mismatch"})
                    if hashlib.sha256(payload).hexdigest().lower() != lfs_oid:
                        payload_errors_local.append({"category": "lfs-sha256", "detail": "reachable LFS payload digest mismatch"})
                    payload_rows, nested_errors = scan_payload(payload, source=f"lfs:{lfs_oid[:16]}")
                    payload_errors_local.extend(nested_errors)
                    lfs_cache[lfs_oid] = (payload_rows, payload_errors_local, container_kind(payload))
            payload_rows, lfs_errors, lfs_kind = lfs_cache[lfs_oid]
            for row in payload_rows:
                violations.extend(attach_context(row, oid=record.oid, object_type="lfs-payload", paths=paths, refs=refs))
            for error in lfs_errors:
                errors.append({**error, "object": record.oid, "refs": refs, "paths": paths, "lfsOidPrefix": lfs_oid[:16]})
            if not lfs_errors:
                for path in paths:
                    required_kind = expected_container(path)
                    if required_kind is not None and lfs_kind != required_kind:
                        errors.append(
                            {
                                "category": "container-mismatch",
                                "object": record.oid,
                                "refs": refs,
                                "paths": [path],
                                "detail": f"LFS suffix requires {required_kind}, detected {lfs_kind or 'none'}",
                            }
                        )

    unique_violations: dict[tuple[object, ...], dict[str, object]] = {}
    for row in violations:
        key = (
            row.get("path"),
            row.get("object"),
            row.get("objectType"),
            tuple(row.get("refs", [])),
            row.get("category"),
            row.get("line"),
            row.get("column"),
            row.get("matchSha256"),
            row.get("source"),
        )
        unique_violations[key] = row
    return {
        "schemaVersion": 1,
        "mode": mode_name,
        "repository": git_bytes("config", "--get", "remote.origin.url", check=False).decode("utf-8", errors="replace").strip(),
        "objectCount": len(oids),
        "violationCount": len(unique_violations),
        "errorCount": len(errors),
        "violations": sorted(
            unique_violations.values(),
            key=lambda row: (
                str(row.get("path", "")),
                str(row.get("object", "")),
                str(row.get("category", "")),
                int(row.get("line") or 0),
                int(row.get("column") or 0),
            ),
        ),
        "errors": errors,
    }


def self_test() -> None:
    separator = chr(92)
    drive_path = chr(88) + ":" + separator + "profile" + separator + "tool"
    unc_path = separator * 2 + "server" + separator + "share" + separator + "item"
    posix_path = "/" + "home" + "/" + "account" + "/tool"
    mac_path = "/" + "Users" + "/" + "account" + "/tool"
    wsl_path = "/" + "mnt" + "/" + "x" + "/tool"
    file_uri = "file:" + "/" * 3 + chr(88) + ":/tool"
    positives = [drive_path, unc_path, posix_path, mac_path, wsl_path, file_uri]
    negatives = [
        "https://example.invalid/schema.json",
        "asset://portable/item",
        "method-fixture://owner/method",
        "/usr/bin/env",
        "/data/local/tmp/agent",
        "relative/path/to/tool",
        "GBP_FRIDA_PYTHON",
    ]
    for value in positives:
        if not scan_scalar_bytes(value.encode("utf-8"), "self-test"):
            raise AssertionError("positive path classifier case was missed")
    for value in negatives:
        if scan_scalar_bytes(value.encode("utf-8"), "self-test"):
            raise AssertionError("negative path classifier case was rejected")
    if not all(is_local_path(value) for value in (".local", ".local/item", "./.local/item", "/.local/item")):
        raise AssertionError("tracked .local classifier case was missed")
    if any(is_local_path(value) for value in ("local/item", "nested/.local/item")):
        raise AssertionError("non-root .local classifier case was rejected")
    utf16 = drive_path.encode("utf-16le")
    if not any(row["encoding"].startswith("utf-16") for row in scan_scalar_bytes(utf16, "self-test")):
        raise AssertionError("UTF-16 path classifier case was missed")
    binary_drive = b"\x00\xffprefix:" + (chr(88) + ":" + separator + "Users" + separator + "account" + separator + "tool").encode("ascii") + b"\x00suffix"
    binary_rows = scan_scalar_bytes(binary_drive, "self-test-binary")
    if not any(row["encoding"] == "raw-ascii" and row["category"] == "windows-drive" for row in binary_rows):
        raise AssertionError("raw-ASCII binary path classifier case was missed")
    binary_posix = b"\x00\xffprefix:" + ("/" + "Users" + "/" + "user" + "/cache/tool").encode("ascii") + b"\x00suffix"
    if not any(row["encoding"] == "raw-ascii" and row["category"] == "posix-home" for row in scan_scalar_bytes(binary_posix, "self-test-binary")):
        raise AssertionError("raw-ASCII binary POSIX path classifier case was missed")
    compressed = gzip.compress(drive_path.encode("utf-8"), mtime=0)
    rows, errors = scan_payload(compressed, source="self-test")
    if errors or not any("!gzip" in str(row["source"]) for row in rows):
        raise AssertionError("gzip expansion classifier case was missed")
    print("host_path_policy_self_test=passed")


def write_report(report: dict[str, object], path: Path | None) -> None:
    if path is not None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"mode={report['mode']}")
    print(f"objects={report['objectCount']}")
    print(f"violations={report['violationCount']}")
    print(f"errors={report['errorCount']}")
    for row in report["violations"][:200]:  # type: ignore[index]
        line = row.get("line") or 0
        print(f"{row['path']}:{line}\t{row['category']}\t{row['summary']}")
    if int(report["violationCount"]) > 200:
        print("additional violations are available only in the redacted JSON report")
    for error in report["errors"][:50]:  # type: ignore[index]
        print(f"ERROR\t{error.get('category')}\t{error.get('detail', 'policy audit failure')}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--tree", action="store_true", help="scan every path and blob in the current index")
    mode.add_argument("--staged", action="store_true", help="scan staged additions/modifications and any tracked .local path")
    mode.add_argument("--history", action="store_true", help="scan objects reachable from an explicit frozen ref ledger")
    mode.add_argument("--self-test", action="store_true", help="run synthetic classifier and container tests")
    parser.add_argument("--refs-file", type=Path)
    parser.add_argument("--report", type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.self_test:
        self_test()
        return 0
    self_test()
    if args.history:
        if args.refs_file is None:
            raise SystemExit("--history requires --refs-file")
        refs = read_ref_ledger(args.refs_file)
        oids, object_paths, object_refs = history_inventory(refs)
        report = scan_entries(
            entries=None,
            history_oids=oids,
            object_paths=object_paths,
            object_refs=object_refs,
            mode_name="history",
        )
    else:
        entries = parse_index()
        mode_name = "tree"
        if args.staged:
            selected = staged_paths()
            entries = [entry for entry in entries if entry.path in selected or is_local_path(entry.path)]
            mode_name = "staged"
        report = scan_entries(
            entries=entries,
            history_oids=None,
            object_paths={},
            object_refs={},
            mode_name=mode_name,
        )
    write_report(report, args.report)
    return 1 if report["violationCount"] or report["errorCount"] else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"host-path policy audit failed closed: {exc}", file=sys.stderr)
        raise SystemExit(2)
