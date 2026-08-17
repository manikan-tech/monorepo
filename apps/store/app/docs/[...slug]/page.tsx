import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findNavDoc } from "../_lib/nav-utils";
import { readDocSource, compileDoc, extractHeadings } from "../_lib/mdx";
import TableOfContents from "../_components/TableOfContents";

type Params = { slug: string[] };

/** The publish gate, enforced at the route level: a slug with no entry in
 *  nav.ts 404s here even if its markdown file exists on disk (see
 *  content/docs/garments/_unlisted-proof.md, which deliberately has no
 *  nav entry, for the case this guards against). */
async function resolveDoc(slugParts: string[]) {
  const slug = slugParts.join("/");
  const found = findNavDoc(slug);
  if (!found) return null;
  const source = await readDocSource(slug);
  if (!source) return null; // in nav.ts but the .md file is missing -- also a 404, not a crash
  return { ...found, slug, source };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolveDoc(slug);
  if (!resolved) return {};
  return { title: resolved.doc.title, description: resolved.doc.description };
}

export default async function DocPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const resolved = await resolveDoc(slug);
  if (!resolved) notFound();

  const [content, headings] = await Promise.all([
    compileDoc(resolved.source),
    Promise.resolve(extractHeadings(resolved.source)),
  ]);

  return (
    <div className="flex gap-10 px-4 py-10 sm:px-8 lg:px-10">
      <article className="prose prose-neutral dark:prose-invert min-w-0 max-w-none flex-1">
        <p className="!mb-2 !mt-0 text-xs font-semibold uppercase tracking-wide text-gold-600 dark:text-gold-400">
          {resolved.category.title}
        </p>
        {content}
      </article>
      <aside className="hidden w-56 shrink-0 xl:block">
        <div className="sticky top-24">
          <TableOfContents headings={headings} />
        </div>
      </aside>
    </div>
  );
}
