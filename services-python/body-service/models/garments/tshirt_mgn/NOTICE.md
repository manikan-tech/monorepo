# Garment template asset — provenance & license

## Source
These garment meshes are extracted from the **Multi-Garment Network (MGN) Digital
Wardrobe** dataset (Max Planck Institute for Informatics).

- Project: https://virtualhumans.mpi-inf.mpg.de/mgn/
- Paper: Bhatnagar et al., "Multi-Garment Net: Learning to Dress 3D People from
  Images", ICCV 2019 (arXiv:1908.06903)

Files:
- `tshirt_crew_base.obj` — `TShirtNoCoat` from `subject_058`; used as the **female**
  template (its donor's chest shape reads female).
- `tshirt_male.obj` — `TShirtNoCoat` from MGN subject `125611520702831`; used as the
  **male** template (flat/male chest drape). Selected because the MGN donor pool is
  female-skewed and a female-donor tee renders a bust on a male body.
- `reference_body.pkl` / `reference_body_male.pkl` — the neutral-SMPL registrations
  (betas/pose/gender) of the two donor subjects.
- `_sample_textured/` — a second t-shirt (`125611510415310`) shipping with `multi_tex.jpg`,
  kept only to validate the UV/texture path.

## ⚠️ LICENSE — NON-COMMERCIAL ONLY
The MGN dataset is released for **non-commercial scientific research, education, or
artistic projects only**. Commercial use — including incorporation into a commercial
product or service — is **prohibited** by the dataset license.

**This asset is used here strictly as a proof-of-concept placeholder.** It MUST be
replaced with an independently-authored (or commercially-licensed) garment template
before Manikan is used commercially. Verify the exact MGN license text yourself before
relying on it.

## Why these files are git-ignored
See `.gitignore` in this folder: the binary dataset files are intentionally excluded
from version control so the non-commercial assets are not committed or pushed. Only
this `NOTICE.md` and `template_meta.json` are tracked, to document what belongs here.
