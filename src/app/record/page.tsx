import { redirect } from "next/navigation";

import { Page } from "@/components/ui";
import { currentUser } from "@/lib/session";

import { RecordForm } from "./record-form";

export default async function RecordPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  return (
    <Page
      title="Record how you're feeling"
      description="This stays private to you unless you choose to share it."
    >
      <RecordForm />
    </Page>
  );
}
