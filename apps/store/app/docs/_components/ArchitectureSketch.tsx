"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Caveat } from "next/font/google";
import rough from "roughjs";

/** Hand-drawn-style system diagram — real roughjs (the same sketchy-rendering
 *  engine Excalidraw itself is built on), not a re-skinned Mermaid flowchart.
 *  Renders straight into an inline SVG, no canvas, no external asset -- so it
 *  themes with the page (light/dark) and scales like any other vector.
 *
 *  Client-only: roughjs needs a live DOM element to attach its SVG generator
 *  to, the same reason Mermaid.tsx runs in the browser rather than at
 *  compile time. */

const caveat = Caveat({ subsets: ["latin"], weight: ["500", "600", "700"] });

type NodeDef = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  lines: string[];
  accent: "gold" | "forest" | "muted";
};

type EdgeDef = {
  from: string;
  to: string;
  label: string[];
  accent: "gold" | "forest" | "muted";
};

const NODES: NodeDef[] = [
  {
    id: "store",
    x: 400,
    y: 255,
    w: 260,
    h: 170,
    title: "Main Next.js Server",
    lines: ["apps/store · Next.js 16.2.0", "generatePublicKey()", "authorizeWidgetRequest()", "Origin allowlist check"],
    accent: "forest",
  },
  {
    id: "widget",
    x: 40,
    y: 40,
    w: 230,
    h: 130,
    title: "Storefront Widget",
    lines: ["widget.js / recommend-widget.js", "runs on the retailer's own site", "holds the public pk_live_ key"],
    accent: "gold",
  },
  {
    id: "body",
    x: 790,
    y: 40,
    w: 230,
    h: 130,
    title: "Body Service (SMPL)",
    lines: ["FastAPI · :8001", "/generate-dressed-avatar", "BODY_SERVICE_KEY"],
    accent: "muted",
  },
  {
    id: "rec",
    x: 790,
    y: 560,
    w: 230,
    h: 130,
    title: "Recommendation Service",
    lines: ["FastAPI · :8002", "/recommend", "RECOMMENDATION_SERVICE_KEY"],
    accent: "muted",
  },
  {
    id: "vton",
    x: 40,
    y: 560,
    w: 230,
    h: 130,
    title: "2D VTON Service",
    lines: ["FastAPI · :8003 · FASHN.ai", "/api/vton/2d", "X-Manikan-Internal-Key"],
    accent: "muted",
  },
];

const EDGES: EdgeDef[] = [
  { from: "widget", to: "store", label: ["X-Manikan-Key (public)", "+ Origin header"], accent: "gold" },
  { from: "store", to: "body", label: ["internal key,", "server-to-server only"], accent: "forest" },
  { from: "store", to: "rec", label: ["internal key,", "server-to-server only"], accent: "forest" },
  { from: "store", to: "vton", label: ["internal key,", "server-to-server only"], accent: "forest" },
];

const ACCENT_HEX = {
  light: { gold: "#A87548", forest: "#163c44", muted: "#6B7280" },
  dark: { gold: "#e1b382", forest: "#A0C7CC", muted: "#8CA3A8" },
};

function center(n: NodeDef) {
  return { x: n.x + n.w / 2, y: n.y + n.h / 2 };
}

/** Point where a straight line between two box centers crosses the edge of
 *  the `from` box's rectangle -- so arrows visually touch the box border
 *  instead of overlapping its label text. */
function edgePoint(from: NodeDef, to: NodeDef) {
  const c1 = center(from);
  const c2 = center(to);
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const halfW = from.w / 2;
  const halfH = from.h / 2;
  const scaleX = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? halfH / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);
  return { x: c1.x + dx * scale, y: c1.y + dy * scale };
}

export default function ArchitectureSketch() {
  const svgRef = useRef<SVGSVGElement>(null);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted || !svgRef.current) return;
    const svg = svgRef.current;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const isDark = resolvedTheme === "dark";
    const colors = isDark ? ACCENT_HEX.dark : ACCENT_HEX.light;
    const textColor = isDark ? "#F4F8F8" : "#1A1A2E";
    const labelColor = isDark ? "#C8E0E3" : "#4A5568";

    const rc = rough.svg(svg, {
      options: { seed: 7 },
    });

    // Edges first, so node boxes visually sit on top of the line ends.
    for (const edge of EDGES) {
      const fromNode = NODES.find((n) => n.id === edge.from)!;
      const toNode = NODES.find((n) => n.id === edge.to)!;
      const p1 = edgePoint(fromNode, toNode);
      const p2 = edgePoint(toNode, fromNode);
      const stroke = colors[edge.accent];

      const line = rc.line(p1.x, p1.y, p2.x, p2.y, {
        stroke,
        strokeWidth: 2,
        roughness: 1.6,
      });
      svg.appendChild(line);

      // Hand-drawn arrowheads at both ends -- a genuine bidirectional
      // request/response relationship (proxy in, stream back out), not a
      // one-way call, so both directions get one.
      for (const [tip, tail] of [
        [p1, p2],
        [p2, p1],
      ] as const) {
        const angle = Math.atan2(tail.y - tip.y, tail.x - tip.x);
        const spread = 0.45;
        const len = 16;
        const a1 = angle - spread;
        const a2 = angle + spread;
        const head = rc.linearPath(
          [
            [tip.x + len * Math.cos(a1), tip.y + len * Math.sin(a1)],
            [tip.x, tip.y],
            [tip.x + len * Math.cos(a2), tip.y + len * Math.sin(a2)],
          ],
          { stroke, strokeWidth: 2, roughness: 1.4 }
        );
        svg.appendChild(head);
      }

      // Edge label, offset perpendicular to the line itself -- a fixed
      // vertical nudge (the original approach) only clears a near-horizontal
      // line; these radiate from the centre at steep diagonal angles, so a
      // real perpendicular offset is what actually keeps the text off the
      // stroke on every edge, not just the flattest ones.
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy) || 1;
      const offset = 20;
      // Rotate the direction vector -90°; for edges radiating out of the
      // centre box, this consistently points the label up and outward
      // rather than down into the box below it.
      const perpX = (dy / len) * offset;
      const perpY = (-dx / len) * offset;
      const labelX = midX + perpX;
      const labelY = midY + perpY;
      const labelGroup = document.createElementNS("http://www.w3.org/2000/svg", "text");
      labelGroup.setAttribute("x", String(labelX));
      labelGroup.setAttribute("y", String(labelY));
      labelGroup.setAttribute("text-anchor", "middle");
      labelGroup.setAttribute("fill", stroke);
      labelGroup.setAttribute("class", caveat.className);
      labelGroup.setAttribute("font-size", "17");
      labelGroup.setAttribute("font-weight", "600");
      edge.label.forEach((line, i) => {
        const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        tspan.setAttribute("x", String(labelX));
        tspan.setAttribute("dy", i === 0 ? "0" : "20");
        tspan.textContent = line;
        labelGroup.appendChild(tspan);
      });
      svg.appendChild(labelGroup);
    }

    // Nodes on top of edges.
    for (const node of NODES) {
      const stroke = colors[node.accent];
      const rect = rc.rectangle(node.x, node.y, node.w, node.h, {
        stroke,
        strokeWidth: node.id === "store" ? 3 : 2.2,
        roughness: node.id === "store" ? 1.4 : 1.8,
        fill: stroke,
        fillStyle: "hachure",
        fillWeight: 0.6,
        hachureGap: 8,
      });
      // roughjs's own options don't expose a fill-opacity knob -- setting the
      // real SVG attribute directly on the returned <g> only touches the
      // hachure fill paths (the stroke outline has no `fill` to begin with,
      // so it stays crisp at full opacity), which is what actually keeps the
      // label text underneath readable instead of competing with the wash.
      rect.setAttribute("fill-opacity", "0.35");
      svg.appendChild(rect);

      const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
      title.setAttribute("x", String(node.x + node.w / 2));
      title.setAttribute("y", String(node.y + 30));
      title.setAttribute("text-anchor", "middle");
      title.setAttribute("fill", textColor);
      title.setAttribute("class", caveat.className);
      title.setAttribute("font-size", node.id === "store" ? "26" : "21");
      title.setAttribute("font-weight", "700");
      title.textContent = node.title;
      svg.appendChild(title);

      node.lines.forEach((line, i) => {
        const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
        t.setAttribute("x", String(node.x + node.w / 2));
        t.setAttribute("y", String(node.y + 54 + i * 20));
        t.setAttribute("text-anchor", "middle");
        t.setAttribute("fill", labelColor);
        t.setAttribute("class", caveat.className);
        t.setAttribute("font-size", "15");
        t.textContent = line;
        svg.appendChild(t);
      });
    }
  }, [mounted, resolvedTheme]);

  return (
    <div className="not-prose my-8 flex justify-center overflow-x-auto">
      <svg
        ref={svgRef}
        viewBox="0 0 1050 720"
        className="w-full max-w-[820px]"
        role="img"
        aria-label="The Store's Next.js server sits at the centre, with the storefront widget on one side using a public key, and the Body, Recommendation, and 2D VTON services on the other side, each reached only through a private, server-to-server internal key."
      />
    </div>
  );
}
