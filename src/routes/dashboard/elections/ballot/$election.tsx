import { instance } from "@/lib/instance-config";
import { useEffect, useRef } from "react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { RankedBallot } from "@/components/elections/ranked-ballot";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { getCurrentElectionDashboard } from "@/lib/server/elections/elections";
import { toBallotCandidate } from "@/components/dashboard/dashboard-election-hub";

export const Route = createFileRoute("/dashboard/elections/ballot/$election")({
  loader: () => getCurrentElectionDashboard(),
  component: BallotPage,
});

function BallotPage() {
  const { election } = Route.useParams();
  const { races } = Route.useLoaderData();
  const { user, loading, sessionReady } = useAuth();
  const router = useRouter();
  const refreshedFor = useRef<string | null>(null);
  useEffect(() => {
    if (user && sessionReady && refreshedFor.current !== user.uid) {
      refreshedFor.current = user.uid;
      void router.invalidate();
    }
  }, [user, sessionReady, router]);
  const race = races.find((item) => item.election.toLowerCase() === election.toLowerCase());

  return <main className="min-h-screen bg-[linear-gradient(180deg,color-mix(in_oklch,var(--muted)_48%,transparent),transparent_28rem)] px-3 py-6 sm:px-6 sm:py-10">
    <div className="mx-auto max-w-5xl">
      <Button variant="ghost" asChild className="mb-6 -ml-3"><Link to="/dashboard"><ArrowLeft className="size-4" /> Back to dashboard</Link></Button>
      {loading || (user && !sessionReady) ? <p className="text-muted-foreground">Loading your ballot…</p>
        : !user ? <div className="rounded-xl border bg-card p-6"><h1 className="font-serif text-2xl font-bold">Sign in to vote</h1><Button asChild className="mt-4"><Link to="/login">Sign in</Link></Button></div>
        : !race || race.status !== "VOTING" ? <div className="rounded-xl border bg-card p-6"><h1 className="font-serif text-2xl font-bold">Ballot unavailable</h1><p className="mt-2 text-muted-foreground">This election is not accepting ballots right now.</p></div>
        : <RankedBallot
            election={race.election}
            candidates={race.candidates.map((candidate) => toBallotCandidate(race, candidate))}
            votingStatus={{ hasVoted: race.player.hasVoted, ranking: [] }}
             draftKey={`${instance.id}:ballot:${user.uid}:${race.election}:${race.cycle}`}
            onSubmitted={() => void router.invalidate()}
          />}
    </div>
  </main>;
}
