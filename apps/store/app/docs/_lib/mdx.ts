import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import rehypeSlug from "rehype-slug";
import rehypePrettyCode from "rehype-pretty-code";
import { visit } from "unist-util-visit";
import GithubSlugger from "github-slugger";
import { unified } from "unified";
import remarkParse from "remark-parse";
import Mermaid from "../_components/Mermaid";
import FlowDiagram from "../_components/FlowDiagram";
import ArchitectureSketch from "../_components/ArchitectureSketch";

const CONTENT_ROOT = path.join(process.cwd(), "content", "docs");

/** Known callout kinds. Anything else in a `:::name` block still renders,
 *  just with no matching style — fails visibly (unstyled), not silently. */
const CALLOUT_KINDS = new Set(["note", "warning", "tip"]);

/** remark-directive gives us `:::note ... :::` as a `containerDirective`
 *  mdast node. remark-rehype only knows how to turn that into HTML if we
 *  tell it what element/props to use via `node.data.hName`/`hProperties` —
 *  this plugin does exactly that and nothing else. */
function remarkCalloutDirectives() {
  return (tree: any) => {
    visit(tree, (node) => {
      if (node.type !== "containerDirective") return;
      if (!CALLOUT_KINDS.has(node.name)) return;
      node.data ??= {};
      node.data.hName = "div";
      node.data.hProperties = { className: `callout callout-${node.name}`, "data-callout": node.name };
    });
  };
}

/** ```mermaid fences would otherwise fall into rehype-pretty-code's Shiki
 *  path like any other code block, which can only apply syntax colours, not
 *  render a diagram. Rewriting the mdast `code` node's hast target (same
 *  mechanism remarkCalloutDirectives uses) to a custom "mermaid-diagram" tag
 *  BEFORE rehype-pretty-code runs makes it skip the node entirely (it only
 *  matches `pre > code`), so the raw source reaches the client component
 *  named below untouched, for mermaid.js itself to render into an SVG. */
function remarkMermaidBlocks() {
  return (tree: any) => {
    visit(tree, "code", (node) => {
      if (node.lang !== "mermaid") return;
      node.data ??= {};
      node.data.hName = "mermaid-diagram";
      node.data.hProperties = { source: node.value };
      node.data.hChildren = [];
    });
  };
}

/** Same rewrite mechanism as remarkMermaidBlocks, for ```flow fences — the
 *  hand-rolled vertical-timeline sequence view (FlowDiagram.tsx), used where
 *  a real multi-lane sequence diagram would be too many lanes for the docs
 *  content column to render legibly. */
function remarkFlowBlocks() {
  return (tree: any) => {
    visit(tree, "code", (node) => {
      if (node.lang !== "flow") return;
      node.data ??= {};
      node.data.hName = "flow-diagram";
      node.data.hProperties = { source: node.value };
      node.data.hChildren = [];
    });
  };
}

export type DocHeading = { depth: 2 | 3; text: string; id: string };

/** Reads raw markdown for a slug. Returns null if the file doesn't exist —
 *  callers treat that as a 404, same as an unpublished (not-in-nav) slug. */
export async function readDocSource(slug: string): Promise<string | null> {
  const filePath = path.join(CONTENT_ROOT, `${slug}.md`);
  // Guard against a slug escaping content/docs/ via `..` segments before
  // it ever reaches the filesystem.
  if (!filePath.startsWith(CONTENT_ROOT)) return null;
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

/** Compiles markdown source to a React element via the full plugin
 *  pipeline (GFM tables/strikethrough, callout directives, slugged
 *  headings, Shiki syntax highlighting). Server-only — never sent to the
 *  client as JS. */
export async function compileDoc(source: string) {
  const { content } = await compileMDX({
    source,
    components: { "mermaid-diagram": Mermaid, "flow-diagram": FlowDiagram, ArchitectureSketch },
    options: {
      mdxOptions: {
        remarkPlugins: [remarkGfm, remarkDirective, remarkCalloutDirectives, remarkMermaidBlocks, remarkFlowBlocks],
        rehypePlugins: [
          rehypeSlug,
          [rehypePrettyCode, { theme: { light: "github-light", dark: "github-dark" } }],
        ],
      },
    },
  });
  return content;
}

/** Extracts h2/h3 headings for the "on this page" TOC, using the SAME
 *  slugger rehype-slug uses internally (github-slugger) so ids match
 *  exactly what the compiled page actually renders — computed
 *  independently, not read back from the compiled output, so this has to
 *  stay in lockstep deliberately, not by accident. */
export function extractHeadings(source: string): DocHeading[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(source);
  const slugger = new GithubSlugger();
  const headings: DocHeading[] = [];
  visit(tree, "heading", (node: any) => {
    if (node.depth !== 2 && node.depth !== 3) return;
    const text = node.children
      .filter((c: any) => "value" in c)
      .map((c: any) => c.value)
      .join("");
    if (!text) return;
    headings.push({ depth: node.depth, text, id: slugger.slug(text) });
  });
  return headings;
}
