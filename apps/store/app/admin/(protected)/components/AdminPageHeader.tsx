interface AdminPageHeaderProps {
  label: string;
  title: string;
  highlight?: string;
  subtitle?: string;
}

export default function AdminPageHeader({
  label,
  title,
  highlight,
  subtitle,
}: AdminPageHeaderProps) {
  const titleParts = highlight ? title.split(highlight) : [title];

  return (
    <div
      className="flex flex-col gap-2 mb-8 animate-fade-up transition-all duration-500 hover:translate-x-1"
      style={{ animationDelay: "50ms" }}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-gold-400/90 animate-pulse">
        {label}
      </p>
      <h1 className="font-display text-3xl font-semibold text-forest-950 leading-tight">
        {highlight ? (
          <>
            {titleParts[0]}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-gold-400 to-gold-600">
              {highlight}
            </span>
            {titleParts[1]}
          </>
        ) : (
          title
        )}
      </h1>
      {subtitle && (
        <p className="text-forest-700/60 text-sm mt-1 max-w-2xl">{subtitle}</p>
      )}
    </div>
  );
}
