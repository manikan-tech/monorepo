import Link from "next/link";
import { sortedNav } from "./_lib/nav-utils";

export default function DocsIndexPage() {
  const categories = sortedNav().filter((c) => c.docs.length > 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-8 lg:px-10">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gold-600 dark:text-gold-400">Documentation</p>
      <h1 className="mb-4 font-display text-4xl font-medium text-forest-900 dark:text-cream-50">
        Manikan technical docs
      </h1>
      <p className="mb-10 max-w-xl text-manikan-text-secondary dark:text-cream-200">
        Engineering documentation for how Manikan builds and serves 3D try-on: garment pipelines, the systems behind
        them, and how to set a product up to use them. Written for engineers and technical stakeholders, reviewed
        before publishing.
      </p>

      {categories.length === 0 ? (
        <p className="text-manikan-muted dark:text-cream-300">Nothing published yet.</p>
      ) : (
        <div className="flex flex-col gap-8">
          {categories.map((category) => (
            <section key={category.title}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-manikan-muted dark:text-cream-300">
                {category.title}
              </h2>
              <ul className="flex flex-col gap-2">
                {category.docs.map((doc) => (
                  <li key={doc.slug}>
                    <Link
                      href={`/docs/${doc.slug}`}
                      className="group block rounded-lg border border-manikan-border bg-manikan-card p-4 shadow-soft transition-colors hover:border-gold-400 dark:border-forest-800 dark:bg-forest-900"
                    >
                      <div className="font-medium text-manikan-text group-hover:text-forest-900 dark:text-cream-50">
                        {doc.title}
                      </div>
                      {doc.description && (
                        <div className="mt-1 text-sm text-manikan-text-secondary dark:text-cream-200">{doc.description}</div>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
