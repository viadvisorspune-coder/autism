"use client";

import { useActionState } from "react";

import { Button, Card } from "@/components/ui";

import { submitObservation, type RecordResult } from "./actions";

const SCALES = [
  { name: "overwhelm", label: "Overwhelmed" },
  { name: "energy", label: "Energy" },
  { name: "sensory_load", label: "Sensory load" },
] as const;

export function RecordForm() {
  const [state, action, pending] = useActionState<RecordResult | null, FormData>(
    submitObservation,
    null,
  );

  return (
    <form action={action} className="space-y-6">
      <Card>
        <label className="block">
          <span className="font-medium">What's happening?</span>
          <span className="mt-1 block text-sm text-ink-soft">
            Your own words. Nothing is rephrased or interpreted here.
          </span>
          <textarea
            name="body"
            rows={7}
            required
            className="mt-3 w-full resize-y rounded-md border border-line bg-canvas px-3 py-2.5"
          />
        </label>
      </Card>

      <Card>
        <p className="font-medium">Optional ratings</p>
        <p className="mt-1 text-sm text-ink-soft">
          Skip any of these. They only exist to make patterns easier to see later.
        </p>
        <div className="mt-4 space-y-4">
          {SCALES.map((scale) => (
            <label key={scale.name} className="block">
              <span className="text-sm">{scale.label} — 0 to 10</span>
              <input
                type="number"
                name={scale.name}
                min={0}
                max={10}
                className="mt-1 w-24 rounded-md border border-line bg-canvas px-3 py-2"
              />
            </label>
          ))}
        </div>
      </Card>

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {state ? (
          <p className={state.ok ? "text-ink-soft" : "text-warn"} role="status">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
