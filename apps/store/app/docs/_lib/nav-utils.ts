import "server-only";
import { nav, type NavDoc, type NavCategory } from "../../../content/docs/nav";
import { readDocSource, extractHeadings } from "./mdx";

/** Categories and docs within them, sorted by their declared `order` —
 *  the single place presentation order is decided, so the sidebar and any
 *  other consumer of `nav` never need to re-sort independently. */
export function sortedNav(): NavCategory[] {
  return [...nav]
    .sort((a, b) => a.order - b.order)
    .map((cat) => ({ ...cat, docs: [...cat.docs].sort((a, b) => a.order - b.order) }));
}

/** The publish gate: a slug is live if and only if it has a `nav.ts` entry.
 *  A markdown file existing on disk with no entry here is invisible —
 *  this is the ONLY function that decides "is this doc published", so
 *  every route/search/sitemap consumer has to agree with it by construction. */
export function findNavDoc(slug: string): { doc: NavDoc; category: NavCategory } | null {
  for (const category of nav) {
    const doc = category.docs.find((d) => d.slug === slug);
    if (doc) return { doc, category };
  }
  return null;
}

export type SearchEntry = {
  title: string;
  slug: string;
  category: string;
  description?: string;
  headings: string[];
};

/** Built once per request (docs traffic is low-volume and these are small
 *  files — see the T-shirt doc's own &sect;5 finding on this service's
 *  compute profile for why "recompute per request rather than add a build
 *  step" is a deliberate, not lazy, choice here). Only ever reads
 *  published (in-nav) docs, so an unpublished draft can never leak into
 *  search results even if its markdown file exists on disk. */
export async function buildSearchIndex(): Promise<SearchEntry[]> {
  const entries: SearchEntry[] = [];
  for (const category of nav) {
    for (const doc of category.docs) {
      const source = await readDocSource(doc.slug);
      const headings = source ? extractHeadings(source).map((h) => h.text) : [];
      entries.push({
        title: doc.title,
        slug: doc.slug,
        category: category.title,
        description: doc.description,
        headings,
      });
    }
  }
  return entries;
}
