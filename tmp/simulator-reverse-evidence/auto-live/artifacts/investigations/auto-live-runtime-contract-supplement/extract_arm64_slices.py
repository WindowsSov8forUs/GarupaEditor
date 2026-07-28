from __future__ import annotations

import hashlib
import struct
from pathlib import Path

from capstone import Cs, CS_ARCH_ARM64, CS_MODE_LITTLE_ENDIAN


HERE = Path(__file__).resolve().parent
SAMPLE = HERE.parents[2] / "samples/jp.co.craftegg.band/10.1.3_229/extracted/libil2cpp.so"
EXPECTED_SHA256 = "66C9C666C50962B662DF8D894E851C7D18F07142DCA145CFAC3D30D063D1D9FA"
SLICES = {
    "030ed1b4__NoteMultipleDirectionalFlick__MoveState.arm64.tsv": (0x30ED1B4, 0x30ED1F0),
    "030ed578__NoteMultipleDirectionalFlick__ExecTouchBegan.arm64.tsv": (0x30ED578, 0x30ED5B4),
    "030ed6dc__NoteMultipleDirectionalFlick__ExecTouchMoved.arm64.tsv": (0x30ED6DC, 0x30ED8A4),
    "030ed910__NoteMultipleDirectionalFlick__getCount.arm64.tsv": (0x30ED910, 0x30ED948),
    "030ee62c__NoteMultipleDirectionalFlick__ctor.arm64.tsv": (0x30EE62C, 0x30EE630),
    "030e69ac__NoteAddLongMultipleDirectionalFlickVisual__MoveState.arm64.tsv": (0x30E69AC, 0x30E69B0),
    "030e6f5c__NoteAddLongMultipleDirectionalFlickVisual__forcePerfect.arm64.tsv": (0x30E6F5C, 0x30E6F60),
    "030e821c__NoteAddSlideMultipleDirectionalFlickVisual__MoveState.arm64.tsv": (0x30E821C, 0x30E8220),
    "030e8870__NoteAddSlideMultipleDirectionalFlickVisual__forcePerfect.arm64.tsv": (0x30E8870, 0x30E8874),
}


def build_outputs() -> dict[str, bytes]:
    binary = SAMPLE.read_bytes()
    assert hashlib.sha256(binary).hexdigest().upper() == EXPECTED_SHA256
    assert binary[:4] == b"\x7fELF" and binary[4] == 2 and binary[5] == 1
    program_header_offset = struct.unpack_from("<Q", binary, 0x20)[0]
    program_header_size = struct.unpack_from("<H", binary, 0x36)[0]
    program_header_count = struct.unpack_from("<H", binary, 0x38)[0]
    load_segments: list[tuple[int, int, int]] = []
    for index in range(program_header_count):
        offset = program_header_offset + index * program_header_size
        if struct.unpack_from("<I", binary, offset)[0] != 1:
            continue
        file_offset = struct.unpack_from("<Q", binary, offset + 8)[0]
        virtual_address = struct.unpack_from("<Q", binary, offset + 16)[0]
        file_size = struct.unpack_from("<Q", binary, offset + 32)[0]
        load_segments.append((virtual_address, virtual_address + file_size, file_offset))

    def read_virtual(start: int, end: int) -> bytes:
        for virtual_start, virtual_end, file_offset in load_segments:
            if virtual_start <= start and end <= virtual_end:
                translated = file_offset + start - virtual_start
                return binary[translated:translated + end - start]
        raise AssertionError(f"RVA range 0x{start:X}..0x{end:X} is outside PT_LOAD file data")

    decoder = Cs(CS_ARCH_ARM64, CS_MODE_LITTLE_ENDIAN)
    outputs: dict[str, bytes] = {}
    for name, (start, end) in SLICES.items():
        rows = ["address\tbytes\tinstruction"]
        for instruction in decoder.disasm(read_virtual(start, end), start):
            operands = f" {instruction.op_str}" if instruction.op_str else ""
            rows.append(
                f"0x{instruction.address:X}\t{instruction.bytes.hex().upper()}\t{instruction.mnemonic}{operands}"
            )
        assert len(rows) == 1 + ((end - start) // 4)
        outputs[name] = ("\n".join(rows) + "\n").encode("utf-8")
    return outputs


def main() -> None:
    output_dir = HERE / "decompiled"
    output_dir.mkdir(exist_ok=True)
    outputs = build_outputs()
    for name, data in outputs.items():
        (output_dir / name).write_bytes(data)
    sums = [f"{hashlib.sha256(data).hexdigest().upper()}  {name}" for name, data in sorted(outputs.items())]
    (output_dir / "SHA256SUMS").write_bytes(("\n".join(sums) + "\n").encode("utf-8"))


if __name__ == "__main__":
    main()
