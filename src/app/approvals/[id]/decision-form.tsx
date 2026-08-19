"use client";

import { useActionState, useState } from "react";

import { Button, Card } from "@/components/ui";
import type { ApprovalOption } from "@/db/schema";

import { decideApproval, type DecisionResult } from "../actions";

/**
 * Renders exactly the options Yoxa supplied. This app adds none of its own —
 * an option that does not exist upstream cannot be answered.
 */
export function DecisionForm({
  approvalId,
  options,
}: {
  approvalId: string;
  options: ApprovalOption[];
}) {
  const [state, action, pending] = useActionState<
    DecisionResult | null,
    FormData
  >(decideApproval, null);
  const [writingOwn, setWritingOwn] = useState(false);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="approval_id" value={approvalId} />

      {!writingOwn ? (
        <Card>
          <fieldset>
            <legend className="font-medium">Your decision</legend>
            <div className="mt-3 space-y-3">
              {options.map((option) => (
                <label key={option.option_id} className="flex gap-3">
                  <input
                    type="radio"
                    name="option_id"
                    value={option.option_id}
                    className="mt-1.5"
                  />
                  <span>
                    <span className="font-medium">{option.title}</span>
                    {option.description ? (
                      <span className="block text-sm text-ink-soft">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </Card>
      ) : (
        <Card>
          <label className="block">
            <span className="font-medium">Write your own response</span>
            <textarea
              name="override_message"
              rows={5}
              className="mt-2 w-full resize-y rounded-md border border-line bg-canvas px-3 py-2.5"
            />
          </label>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send decision"}
        </Button>
        <Button
          type="button"
          variant="quiet"
          onClick={() => setWritingOwn((v) => !v)}
        >
          {writingOwn ? "Choose an option instead" : "None of these fit"}
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
