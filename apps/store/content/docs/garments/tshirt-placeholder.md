# T-Shirt (placeholder)

This is a scaffold-validation stub, not the real documentation. It exists to prove the docs pipeline end to end — sidebar entry, page routing, right-hand table of contents, search indexing, callouts, tables, and syntax-highlighted code — before the real T-shirt content is reviewed and handed over for placement.

## Architecture overview

Once this scaffold is confirmed, the real doc will cover both pipelines in detail: a kinematic fitting engine and a physics-baked drape system.

:::note
This section is a stand-in. The real content will cite actual functions from `app/garment.py` and `app/physics_drape.py`, with real benchmark data and real rendered figures.
:::

### A sample table

Tables should render cleanly, with numeric columns aligned and a visible header row.

| Stage | Function | Cost |
|---|---|---|
| Bind | `bind_garment()` | one-time, cached |
| Deform | `deform_garment()` | per-request |
| Smooth | `smooth_garment()` | per-request |

### A sample code block

Code fences should get real syntax highlighting, not just a gray box:

```python
def resolve_interpenetration(verts, body_verts, faces, body_mesh=None):
    """Push any garment vertex inside the body back out to a minimum clearance."""
    corrected = verts.copy()
    # ... real implementation lives in app/garment.py
    return corrected, info
```

```ts
// TypeScript should highlight too
export function findDoc(slug: string): NavDoc | null {
  return null;
}
```

:::warning
This callout type should read as more urgent than the note above — a distinct color, not just a different label.
:::

## Benchmarks section (placeholder)

The real doc will include a benchmarks table like this, sourced from live-measured data, plus an embedded chart image:

| Metric | Value |
|---|---|
| Mean latency | 900.6 ms |
| p95 latency | 973.3 ms |

![A placeholder figure, standing in for a real benchmark chart](/docs/placeholder-figure.png)
*Figure captions should render distinctly from body text — this one is a generated stand-in, not real data.*

:::tip
Once this whole page looks right in both light and dark mode, and on a narrow viewport, hand over the real T-shirt markdown and it drops in the same way this file did.
:::

## Closing check

- [x] Sidebar shows this page under "Garments"
- [x] This page's own headings appear in the right-hand "on this page" list
- [x] Searching part of this page's title finds it
- [x] An unlisted file sitting in this same folder does **not** appear anywhere
