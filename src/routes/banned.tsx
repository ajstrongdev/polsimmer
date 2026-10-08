import { instance } from "@/lib/instance-config";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldX } from "lucide-react";
import { signOutAndRedirect } from "@/lib/auth-utils";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/banned")({ component: BannedPage });

function BannedPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <section className="w-full max-w-lg rounded-2xl border bg-card p-8 text-center shadow-sm sm:p-10">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldX className="size-7" />
        </div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-destructive">Account access suspended</p>
        <h1 className="font-serif text-3xl font-bold tracking-tight">You’ve been banned.</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
          This account can no longer access {instance.name}. If you believe this was a mistake, please contact the site administrators.
        </p>
        <Button className="mt-7" variant="outline" onClick={() => void signOutAndRedirect()}>
          Sign out
        </Button>
      </section>
    </main>
  );
}
