"use client";

import { useState } from "react";

import { Button, Card, Page } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

/**
 * Magic-link sign-in. No password to remember or reset, which is one fewer
 * barrier on a screen people may reach while already overloaded.
 */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/` },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }
    setStatus("sent");
  }

  return (
    <Page title="Sign in" description="We'll email you a link. No password.">
      <Card>
        {status === "sent" ? (
          <p>
            Check <strong>{email}</strong> for a sign-in link. You can close this
            tab.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="text-sm text-ink-soft">Email address</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-line bg-canvas px-3 py-2.5"
              />
            </label>
            <Button type="submit" disabled={status === "sending"}>
              {status === "sending" ? "Sending…" : "Email me a link"}
            </Button>
            {status === "error" ? (
              <p className="text-warn">{message}</p>
            ) : null}
          </form>
        )}
      </Card>
    </Page>
  );
}
