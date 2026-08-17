/** A request/response sequence, rendered as a vertical timeline instead of a
 *  classic multi-lane UML sequence diagram. Mermaid's own sequence renderer
 *  was tried first and dropped: squeezed into the ~700px docs content
 *  column, 5 participant lanes force tiny fonts and overlapping labels no
 *  matter how the theme is tuned -- the lane metaphor itself doesn't fit
 *  this width. A vertical list has no such ceiling: it can hold arbitrarily
 *  long actor names and messages at full, readable size, and it's the
 *  layout most API-docs sites (Stripe, Twilio) already reach for once a
 *  sequence gets wide, for the same reason.
 *
 *  Renders server-side -- no DOM/browser APIs needed, unlike Mermaid.tsx,
 *  so there's no client bundle cost and no "Rendering diagram..." flash. */

type Step =
  | { kind: "message"; from: string; to: string; text: string }
  | { kind: "loop"; label: string; steps: Extract<Step, { kind: "message" }>[] };

type Actor = { id: string; label: string };

// Cycles through real brand shades only -- no hue introduced that isn't
// already in tailwind.config.ts -- so an actor's colour reads as "this
// system's palette, one more shade" rather than an arbitrary new accent.
const ACTOR_COLORS = [
  { dot: "bg-gold-500", text: "text-gold-700 dark:text-gold-300" },
  { dot: "bg-forest-400", text: "text-forest-600 dark:text-cream-200" },
  { dot: "bg-forest-700 dark:bg-forest-400", text: "text-forest-800 dark:text-forest-200" },
  { dot: "bg-gold-700 dark:bg-gold-400", text: "text-gold-800 dark:text-gold-300" },
  { dot: "bg-cream-500", text: "text-manikan-muted dark:text-cream-300" },
];

/** Tiny purpose-built grammar, not a Mermaid subset -- kept intentionally
 *  smaller than Mermaid's own sequence syntax since this only ever needs to
 *  express what this doc set actually draws: actors, one-line messages
 *  (including self-messages), and a single level of `loop ... end` nesting.
 *
 *    actor ID: Display label
 *    ID -> ID: message text
 *    loop label text
 *    ID -> ID: message text
 *    end
 */
function parseFlow(source: string): { actors: Actor[]; steps: Step[] } {
  const actors: Actor[] = [];
  const steps: Step[] = [];
  let currentLoop: Extract<Step, { kind: "loop" }> | null = null;

  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const actorMatch = line.match(/^actor\s+(\S+):\s*(.+)$/);
    if (actorMatch && actorMatch[1] && actorMatch[2]) {
      actors.push({ id: actorMatch[1], label: actorMatch[2] });
      continue;
    }

    if (line.startsWith("loop ")) {
      currentLoop = { kind: "loop", label: line.slice(5).trim(), steps: [] };
      continue;
    }
    if (line === "end") {
      if (currentLoop) steps.push(currentLoop);
      currentLoop = null;
      continue;
    }

    const messageMatch = line.match(/^(\S+)\s*->\s*(\S+):\s*(.+)$/);
    if (messageMatch && messageMatch[1] && messageMatch[2] && messageMatch[3]) {
      const step: Extract<Step, { kind: "message" }> = {
        kind: "message",
        from: messageMatch[1],
        to: messageMatch[2],
        text: messageMatch[3],
      };
      if (currentLoop) currentLoop.steps.push(step);
      else steps.push(step);
    }
  }

  return { actors, steps };
}

function ActorLabel({ actor, colorIndex }: { actor: Actor; colorIndex: number }) {
  const c = ACTOR_COLORS[colorIndex % ACTOR_COLORS.length] ?? ACTOR_COLORS[0]!;
  return (
    <span className="inline-flex items-center gap-1.5 font-medium">
      <span className={`h-2 w-2 shrink-0 rounded-full ${c.dot}`} aria-hidden="true" />
      <span className={c.text}>{actor.label}</span>
    </span>
  );
}

function MessageRow({
  step,
  actorIndex,
  compact,
}: {
  step: Extract<Step, { kind: "message" }>;
  actorIndex: Map<string, { actor: Actor; index: number }>;
  compact?: boolean;
}) {
  const from = actorIndex.get(step.from);
  const to = actorIndex.get(step.to);
  const isSelf = step.from === step.to;
  if (!from || !to) return null;

  return (
    <div className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${compact ? "text-[13px]" : "text-sm"}`}>
      <ActorLabel actor={from.actor} colorIndex={from.index} />
      <span className="text-manikan-muted dark:text-cream-300" aria-hidden="true">
        {isSelf ? "↻" : "→"}
      </span>
      {!isSelf && <ActorLabel actor={to.actor} colorIndex={to.index} />}
      <span className="w-full basis-full text-manikan-text-secondary dark:text-cream-100">{step.text}</span>
    </div>
  );
}

export default function FlowDiagram({ source }: { source: string }) {
  const { actors, steps } = parseFlow(source);
  const actorIndex = new Map(actors.map((a, i) => [a.id, { actor: a, index: i }]));

  return (
    <div className="not-prose my-6 rounded-lg border border-manikan-border bg-manikan-card p-5 dark:border-forest-800 dark:bg-forest-900 sm:p-6">
      {/* Legend: every actor's colour, stated once up front */}
      <div className="mb-5 flex flex-wrap gap-x-4 gap-y-1.5 border-b border-manikan-border pb-4 dark:border-forest-800">
        {actors.map((a, i) => (
          <ActorLabel key={a.id} actor={a} colorIndex={i} />
        ))}
      </div>

      <ol className="relative flex flex-col gap-4 border-l border-manikan-border pl-5 dark:border-forest-800">
        {steps.map((step, i) => {
          if (step.kind === "loop") {
            return (
              <li key={i} className="relative">
                <span
                  className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-manikan-card bg-gold-400 dark:border-forest-900"
                  aria-hidden="true"
                />
                <div className="rounded-md border border-dashed border-gold-400/60 bg-gold-50/50 p-3 dark:bg-gold-900/10">
                  <div className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-gold-700 dark:text-gold-300">
                    ↻ Repeats — {step.label}
                  </div>
                  <div className="flex flex-col gap-2.5 border-l border-gold-400/40 pl-3">
                    {step.steps.map((inner, j) => (
                      <MessageRow key={j} step={inner} actorIndex={actorIndex} compact />
                    ))}
                  </div>
                </div>
              </li>
            );
          }
          return (
            <li key={i} className="relative">
              <span
                className="absolute -left-[23px] top-1.5 h-1.5 w-1.5 rounded-full bg-manikan-muted dark:bg-cream-300"
                aria-hidden="true"
              />
              <MessageRow step={step} actorIndex={actorIndex} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
