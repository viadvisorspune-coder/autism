import { cn } from "@/lib/utils";

/**
 * The small set of primitives every ORCA screen is built from. Kept in one file
 * while the design language is still open, so restyling means editing here
 * rather than hunting through pages.
 */

export function Page({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <main id="main" className="mx-auto w-full max-w-2xl px-5 py-10 sm:py-16">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description ? (
        <p className="mt-2 text-ink-soft">{description}</p>
      ) : null}
      <div className="mt-8 space-y-6">{children}</div>
    </main>
  );
}

export function Card({
  children,
  className,
  tone = "plain",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "plain" | "attention";
}) {
  return (
    <section
      className={cn(
        "rounded-card border p-5",
        tone === "attention"
          ? "border-warn/40 bg-warn-soft"
          : "border-line bg-surface",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "quiet";
}) {
  return (
    <button
      {...props}
      className={cn(
        "rounded-md px-4 py-2.5 font-medium disabled:opacity-50",
        variant === "primary"
          ? "bg-accent text-canvas"
          : "border border-line bg-surface text-ink",
        className,
      )}
    />
  );
}

/** Says where a piece of information came from, never hiding AI inference. */
export function Provenance({ value }: { value: string }) {
  const label: Record<string, string> = {
    patient_reported: "You reported this",
    clinician_documented: "Documented by a clinician",
    external_document: "From an uploaded document",
    system_generated: "Recorded by the system",
    ai_inferred: "Suggested by AI — not an observed fact",
  };
  return (
    <span
      className={cn(
        "inline-block text-sm",
        value === "ai_inferred" ? "text-warn" : "text-ink-soft",
      )}
    >
      {label[value] ?? value}
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-card border border-dashed border-line px-5 py-8 text-center text-ink-soft">
      {children}
    </p>
  );
}
