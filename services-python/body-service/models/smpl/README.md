# SMPL Model Files

The body service loads the **SMPL** parametric body model to generate 3D
avatars from measurements. These model files are **not committed to git** —
they are large (~38–53 MB each) and covered by the SMPL license.

> **License:** SMPL is used under a **research license** for ITI. A
> **commercial license** is required before any real-money product launch.
> Do **not** commit these files or bake them into a public Docker image.

## Required files

The engine (`app/main.py`) loads these two **cleaned** files via `smplx`:

| File | Gender | Approx. size |
|------|--------|--------------|
| `SMPL_MALE.pkl`   | male   | ~53 MB |
| `SMPL_FEMALE.pkl` | female | ~53 MB |

"Cleaned" means the original SMPL `.pkl` files have had their `chumpy`
objects stripped and converted to plain NumPy arrays.

## Setup

1. Download the original SMPL model from the official project page:
   https://smpl.is.tue.mpg.de/  (requires a free account + license acceptance).
   You will get files named like:
   - `basicmodel_m_lbs_10_207_0_v1.0.0.pkl`
   - `basicModel_f_lbs_10_207_0_v1.0.0.pkl`

2. Place all `.pkl` files in this directory
   (`services-python/body-service/models/smpl/`).

3. Convert them to the cleaned format the engine expects:
   ```bash
   cd services-python/body-service
   python tools/clean_smpl_pkl.py
   ```
   This produces `SMPL_MALE.pkl` and `SMPL_FEMALE.pkl` in this folder.

4. Start the service — it verifies the files are present on boot:
   ```bash
   uvicorn app.main:app --reload --port 8001
   ```
   If the files are missing, avatar endpoints return **503**.

## Note

Everything matching `models/smpl/*.pkl` and `*.npz` is gitignored
(see `../../.gitignore` in this service). Only this `README.md` is tracked,
which keeps the directory present in the repo.
