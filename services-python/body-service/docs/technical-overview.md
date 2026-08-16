# Technical Overview: Manikan SMPL Engine

This document explains the core technical approach behind the Manikan 3D avatar engine. We've designed this system to be fast, mathematically sound, and physically accurate.

## The Core Challenge

Generating a 3D body from measurements is notoriously difficult. Standard approaches often use simple scaling (stretching a base mesh), which results in unnatural, distorted bodies.

We use the **SMPL (Skinned Multi-Person Linear)** model, an industry-standard parametric model trained on thousands of 3D human scans. SMPL represents body shape using 10 parameters (called β or betas). The challenge is: how do we map 5 simple user measurements (height, weight, chest, waist, hips) into these 10 complex mathematical parameters?

## Our Solution: Physics-Informed Differentiable Optimisation

Instead of guessing the parameters using a rigid formula, we treat avatar generation as a search problem. We use **PyTorch** to run a differentiable optimisation loop.

Here is the step-by-step process:

### 1. The "Virtual Tape Measure"

To compare the generated mesh against the user's target measurements, we need to measure the mesh accurately. We use a "virtual tape measure" approach:

- We pre-calculate specific "rings" of vertices around the chest, waist, and hips of the base SMPL model.
- We use a **Convex Hull** algorithm to ensure we only measure the outermost perimeter of the body, preventing the tape measure from zig-zagging internally and inflating the measurement.
- By calculating the distance between these perimeter vertices, we get highly accurate circumferences in real-time.

### 2. The Optimisation Loop (The "Sculptor")

When a request comes in, we start with a default, neutral body (all β parameters set near 0). We then use the **Adam optimiser** to iteratively sculpt the body:

1. **Generate:** The current β parameters generate a 3D mesh.
2. **Scale:** We instantly scale the mesh to exactly match the target height. This is crucial: we **decouple height from shape**. If we force the optimiser to solve for height using the shape parameters, it often results in "alien" proportions (like extremely long necks).
3. **Measure:** We use our virtual tape measure to calculate the chest, waist, and hip circumferences of this scaled mesh.
4. **Compare (Loss Function):** We calculate how far off our measurements are from the user's targets. We prioritise certain measurements:
   - **Waist and Body Mass:** We strongly anchor the first parameter ($\beta_0$) to the user's BMI. This ensures the overall mass is correct immediately.
   - **Chest and Hips:** These refine the specific proportions.
   - **Shape Prior:** We apply a mild penalty to keep the parameters close to zero, ensuring the body remains naturally proportioned and human-like unless extreme measurements demand otherwise.
5. **Update:** The optimiser calculates the gradients and updates the 10 β parameters to reduce the error.
6. **Repeat:** We repeat this process for up to 80 iterations (taking about 1 second total) until the measurements perfectly match the targets.

### 3. The Result

The final, optimised mesh is exported as a standard `.glb` file. Because we scaled the height explicitly and used an optimiser to solve the circumferences naturally, the resulting avatar is both physically accurate to the millimeter and visually realistic.

## Why This Approach is Better

- **No Heuristics:** We don't rely on fragile rules of thumb. The optimiser finds the exact shape that fits the measurements naturally.
- **Stable and Robust:** By decoupling height and using convex hull rings, the system gracefully handles extreme body types (e.g., 140kg bodybuilders or 40kg slender frames) without breaking or distorting.
- **Fast:** Operating directly on the 10 β parameters with PyTorch allows us to generate a bespoke, high-fidelity 3D model in under a second.
