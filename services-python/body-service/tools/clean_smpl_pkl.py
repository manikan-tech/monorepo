#!/usr/bin/env python3
"""
Strip chumpy objects from original SMPL .pkl files.

Strategy: Instead of subclassing ndarray (fragile), we register a fake
chumpy module where `Ch` is a simple wrapper class.  After unpickling
the entire dict, we walk the tree and convert everything to plain numpy.

Usage:
    python tools/clean_smpl_pkl.py
"""

import pickle
import sys
import types
from pathlib import Path

import numpy as np


# ---------------------------------------------------------------------------
# 1. Build a fake chumpy module hierarchy
# ---------------------------------------------------------------------------
def _make_mod(name: str):
    m = types.ModuleType(name)
    sys.modules[name] = m
    return m


for _n in [
    "chumpy", "chumpy.ch", "chumpy.ch_ops", "chumpy.utils",
    "chumpy.linalg", "chumpy.reordering", "chumpy.optimization",
]:
    _make_mod(_n)


class _FakeCh:
    """
    Stand-in for chumpy.ch.Ch.  Pickle will construct this via
    __new__ + __setstate__.  We just stash whatever state we receive
    and convert lazily via to_array().
    """
    def __init__(self, *a, **kw):
        self._data = None

    def __setstate__(self, state):
        if isinstance(state, dict):
            self._data = state.get("x", state)
        else:
            self._data = state

    def to_array(self):
        d = self._data
        if isinstance(d, np.ndarray):
            return d.copy()
        if isinstance(d, _FakeCh):
            return d.to_array()
        if d is None:
            return np.array([])
        return np.asarray(d)


# Register the stub everywhere chumpy pickles might look
sys.modules["chumpy"].Ch = _FakeCh
sys.modules["chumpy.ch"].Ch = _FakeCh


# ---------------------------------------------------------------------------
# 2. Custom Unpickler
# ---------------------------------------------------------------------------
class _Unpickler(pickle.Unpickler):
    def find_class(self, module: str, name: str):
        if module.startswith("chumpy"):
            return _FakeCh
        return super().find_class(module, name)


# ---------------------------------------------------------------------------
# 3. Recursive conversion: _FakeCh → ndarray, keep everything else
# ---------------------------------------------------------------------------
def _convert(obj, depth=0):
    if depth > 50:
        return obj
    if isinstance(obj, _FakeCh):
        return obj.to_array()
    if isinstance(obj, np.ndarray) and type(obj) is not np.ndarray:
        return np.array(obj)  # strip subclasses
    if isinstance(obj, dict):
        return {k: _convert(v, depth + 1) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_convert(v, depth + 1) for v in obj]
    if isinstance(obj, tuple):
        return tuple(_convert(v, depth + 1) for v in obj)
    return obj


# ---------------------------------------------------------------------------
# 4. Pipeline
# ---------------------------------------------------------------------------
def clean_pkl(src: Path, dst: Path) -> None:
    print(f"  Loading  {src.name} …", end=" ", flush=True)

    with open(src, "rb") as f:
        raw = _Unpickler(f, encoding="latin1").load()

    clean = _convert(raw)

    with open(dst, "wb") as f:
        pickle.dump(clean, f, protocol=2)

    mb = dst.stat().st_size / 1_048_576
    print(f"✓  →  {dst.name}  ({mb:.1f} MB)")


def main():
    d = Path(__file__).resolve().parent.parent / "models" / "smpl"

    pairs = {
        "SMPL_MALE.pkl": "basicmodel_m_lbs_10_207_0_v1.0.0.pkl",
        "SMPL_FEMALE.pkl": "basicModel_f_lbs_10_207_0_v1.0.0.pkl",
    }

    print("Cleaning SMPL pickle files …\n")

    for out_name, src_name in pairs.items():
        src = d / src_name
        dst = d / out_name
        if not src.exists():
            print(f"  ✗  Not found: {src}")
            continue
        if dst.is_symlink() or dst.exists():
            dst.unlink()
        clean_pkl(src, dst)

    print("\nDone — cleaned files are ready for smplx.")


if __name__ == "__main__":
    main()
