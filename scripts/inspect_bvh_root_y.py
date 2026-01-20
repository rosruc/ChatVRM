#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path
from typing import List, Tuple


def _find_motion_start(lines: List[str]) -> int:
    try:
        motion_i = next(i for i, l in enumerate(lines) if l.strip() == "MOTION")
    except StopIteration as e:
        raise ValueError("No MOTION section found") from e

    for i in range(motion_i + 1, len(lines)):
        if lines[i].strip().lower().startswith("frame time"):
            for j in range(i + 1, len(lines)):
                s = lines[j].strip()
                if s and s[0] in "+-0123456789.":
                    return j
            break

    raise ValueError("No motion data found")


def _find_root_channel_count(lines: List[str], motion_start: int) -> int:
    # Assumes first CHANNELS line belongs to the root.
    for i in range(0, motion_start):
        if lines[i].lstrip().startswith("CHANNELS"):
            parts = lines[i].split()
            return int(parts[1])
    raise ValueError("No CHANNELS line found")


def _parse_frames_header(text: str) -> int | None:
    m = re.search(r"\bFrames:\s*(\d+)\b", text)
    return int(m.group(1)) if m else None


def _parse_frame_time(text: str) -> float | None:
    m = re.search(r"\bFrame\s+Time:\s*([0-9.]+)", text)
    return float(m.group(1)) if m else None


def _extract_root_ys(lines: List[str], motion_start: int, root_chan_count: int) -> List[float]:
    ys: List[float] = []
    for i in range(motion_start, len(lines)):
        s = lines[i].strip()
        if not s:
            continue
        if s[0] not in "+-0123456789.":
            continue
        vals = s.split()
        if len(vals) < root_chan_count:
            continue
        ys.append(float(vals[1]))  # root Yposition
    if not ys:
        raise ValueError("Parsed 0 motion frames")
    return ys


def _max_adjacent_jump(ys: List[float]) -> Tuple[float, int | None]:
    if len(ys) < 2:
        return 0.0, None
    jumps = [abs(ys[i + 1] - ys[i]) for i in range(len(ys) - 1)]
    mx = max(jumps)
    return mx, jumps.index(mx)


def suggest_trim_leading_frames(ys: List[float], window: int = 10) -> Tuple[int | None, float]:
    last_y = ys[-1]
    mx, _ = _max_adjacent_jump(ys)
    thr = max(0.5, mx * 0.2)  # adaptive but never too tiny

    best: int | None = None
    for k in range(0, len(ys) - window):
        w = ys[k : k + window]
        if all(abs(y - last_y) <= thr for y in w):
            best = k
            break
    return best, thr


def main() -> None:
    ap = argparse.ArgumentParser(description="Inspect BVH root Y (hips) for loop discontinuities")
    ap.add_argument("bvh", type=Path)
    ap.add_argument("--window", type=int, default=10)
    args = ap.parse_args()

    text = args.bvh.read_text(errors="ignore")
    lines = text.splitlines()

    frames_header = _parse_frames_header(text)
    frame_time = _parse_frame_time(text)

    motion_start = _find_motion_start(lines)
    root_chan_count = _find_root_channel_count(lines, motion_start)
    ys = _extract_root_ys(lines, motion_start, root_chan_count)

    mx, mxi = _max_adjacent_jump(ys)
    best, thr = suggest_trim_leading_frames(ys, window=args.window)

    print(f"File: {args.bvh}")
    print(f"Frames header: {frames_header}")
    print(f"Parsed motion frames: {len(ys)}")
    print(f"Frame Time: {frame_time}")
    print(f"firstY: {ys[0]}  lastY: {ys[-1]}  absDiff: {abs(ys[0]-ys[-1])}")
    print(f"maxAdjAbsDiff: {mx}  between: {None if mxi is None else (mxi, mxi+1)}")
    print(f"stabilize_threshold: {thr}")
    print(f"suggest_trim_leading_frames: {best}")
    if best is not None:
        print(f"new_firstY_if_trimmed: {ys[best]}  new_absDiff: {abs(ys[best]-ys[-1])}")

    print("Y0-9:", ys[:10])
    print("Ytail:", ys[-10:])


if __name__ == "__main__":
    main()
