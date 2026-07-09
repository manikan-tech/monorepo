# Frontend Development Rules

## General Principles

- Always write clean, maintainable code.
- Follow DRY.
- Follow SOLID whenever applicable.
- Keep the codebase simple.
- Prefer readability over clever code.
- Never overengineer.

---

## Components

- Reuse existing components before creating new ones.
- If the same UI appears more than once, extract it into a reusable component.
- Keep components focused on a single responsibility.
- Avoid components that become too large.
- Prefer composition over inheritance.

---

## Pages

- Keep page files as small as possible.
- Move complex UI into components.
- Move business logic into hooks.
- Move helpers into utility files.
- Pages should mainly compose components.

---

## Code Organization

- Avoid duplicated logic.
- Avoid duplicated JSX.
- Split responsibilities into separate files.
- Use meaningful folder names.
- Use meaningful component names.

---

## Performance

- Avoid unnecessary re-renders.
- Memoize only when needed.
- Lazy-load heavy components when appropriate.
- Optimize images.
- Keep bundles small.

---

## Styling

- Reuse shared styles.
- Avoid duplicated Tailwind classes when possible.
- Create reusable UI primitives.

---

## Refactoring

When touching existing code:

- Improve it if possible.
- Remove dead code.
- Remove duplicated code.
- Extract reusable pieces.
- Do not change unrelated functionality.

---

## Safety

Never rewrite the entire file unless necessary.

Modify only the relevant code.

Preserve existing functionality.

Do not introduce breaking changes.

Always prefer small incremental changes.

---

## Before Writing Code

Always ask yourself:

1. Can I reuse an existing component?
2. Can I reuse an existing hook?
3. Can I reuse an existing utility?
4. Can this logic be simplified?
5. Am I duplicating code?
6. Is this the smallest clean solution?

## Minimal Changes Policy

Only modify the code required for the requested task.

Never rewrite large sections of a file unless explicitly requested.

Preserve the existing architecture.

Do not rename files or folders unless requested.

Do not change formatting outside the modified code.

Do not refactor unrelated code.

Keep the git diff as small as possible.