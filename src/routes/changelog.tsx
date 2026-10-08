import { instance } from "@/lib/instance-config";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { WikiHeader } from "@/components/wiki/wiki-header";
import { WikiPage } from "@/components/wiki/wiki-layout";

export const Route = createFileRoute("/changelog")({
  head: () => ({ meta: [{ title: "Polsimmer Changelog" }] }),
  component: ChangelogPage,
});

const releases = [
  {
    version: "0.2.2",
    date: "October 1, 2026",
    dateTime: "2026-10-01",
    headline: "A better way to cast your ballot.",
    summary: "Ranking candidates is easier, especially in a crowded race.",
    highlights: [
      {
        title: "Take your time with your vote",
        detail:
          "Ballots now open on their own page and work better on phones. Tap a candidate to move them up or down as many times as you like, or send them straight to a rank. If you leave before submitting, your choices will be waiting when you come back on the same device.",
      },
    ],
  },
  {
    version: "0.2.1",
    date: "October 1, 2026",
    dateTime: "2026-10-01",
    headline: "See every primary. Follow more of the conversation.",
    summary:
      `Track nominations across parties and coalitions, join the conversation on ${instance.branding.socialName}, and keep party decisions moving.`,
    highlights: [
      {
        title: "Follow every primary race",
        detail:
          "For the first time, you can follow live candidates and vote totals in every party and coalition primary, not just the race for your own party or coalition. Browse other parties’ and coalitions’ races with the arrows or swipe on mobile, and vote in your own race right from the dashboard. Primaries also appear on their party and coalition pages. If you are eligible and have not voted, Your next moves reminds you while voting is open; optional browser notifications can remind you too.",
      },
      {
        title: `Make ${instance.branding.socialName} your own`,
        detail:
          "Follow players from their posts or profiles, then use Following to see their posts and reposts. The main feed highlights original posts, and active discussions are easier to find.",
      },
      {
        title: "Add your voice to a post",
        detail:
          "Add your own commentary when quoting a post, or copy its link to share it. Conversations are easier to follow, and links to comments open the full thread.",
      },
      {
        title: "Know when someone replies",
        detail:
          `Comments on your ${instance.branding.socialName} posts now appear alongside mentions in dashboard alerts. Optional browser notifications can let you know when someone replies and take you back to the conversation.`,
      },
      {
        title: "Keep membership moving",
        detail:
          "Party leaders can see membership requests and coalition join requests on the dashboard. Requests that still need a proposal link directly to the right coalition controls.",
      },
      {
        title: "Fill the leadership team",
        detail:
          "Party leaders get a dashboard reminder when an eligible member can be appointed Chief Whip or Social Media Officer, with a link to the appointment controls.",
      },
      {
        title: "Vote while the vote is open",
        detail:
          "Party leaders can open an active coalition proposal vote directly from the dashboard. The reminder clears once their party votes or the voting period ends; optional browser notifications are also available.",
      },
    ],
  },
  {
    version: "0.2.0",
    date: "September 30, 2026",
    dateTime: "2026-09-30",
    headline: "More ways to organize and govern.",
    summary:
      "New ways to organize parties, work with allies, and follow legislation.",
    highlights: [
      {
        title: "Lead your party",
        detail:
          "Parties now have leaders, chief whips, and social media officers. They can coordinate party guidance on bills and manage their party’s representation.",
      },
      {
        title: "Build alliances during elections",
        detail:
          "Party leaders can form electoral pacts during an election. A pact becomes a coalition when three parties join, allowing its members to coordinate nominations and coalition decisions.",
      },
      {
        title: "See government by coalition",
        detail:
          "Government history can group seats by coalition. The Parties view remains the default, with unaffiliated parties and independents listed separately.",
      },
      {
        title: "Make your words stand out",
        detail:
          "Formatting controls and a preview help you write posts, comments, bills, biographies, and wiki articles.",
      },
      {
        title: "Make room for smaller groups",
        detail:
          "A party needs at least three members to keep its status. Smaller groups become pressure groups and can regain party status as they grow.",
      },
      {
        title: "Keep bills moving",
        detail:
          "Bills move through a queue, with each stage lasting 12 hours at regular game speed. Progress is easier to follow, and admins have more control over bill stages.",
      },
      {
        title: "For the developers...",
        detail:
          `Bots can now publish ${instance.branding.socialName} posts through the API, alongside the existing integration tools.`,
      },
    ],
  },
  {
    version: "0.1.2",
    date: "September 29, 2026",
    dateTime: "2026-09-29",
    headline: "A smoother game on every screen.",
    summary:
      "Live updates, clearer election tools, and a more comfortable mobile experience.",
    highlights: [
      {
        title: "Stay in the loop",
        detail:
          `Optional browser notifications alert you to ${instance.branding.socialName} mentions and decisions waiting for you. Set quiet hours, choose which browsers receive them, or keep using in-game alerts.`,
      },
      {
        title: "See the game move",
        detail:
          "The dashboard, conversations, and key game information update live. If you lose connection, the game catches up when you reconnect.",
      },
      {
        title: "Follow the whole election-night count",
        detail:
          "Live Wire posts short reports as election results come in. They track the leader, close challengers, shifts across the field, and the contest for the final Senate seat.",
      },
      {
        title: "Find a bill, then cast your vote",
        detail:
          "Browse bills by stage, search the list, or filter to your own bills, even on mobile. Eligible officeholders can vote on a bill’s page and see when their vote is recorded.",
      },
      {
        title: "A nudge for party leaders",
        detail:
          "When your party has not yet issued guidance on a bill, a reminder appears in Your next moves during House, Senate, and presidential voting. Open the bill from the reminder to recommend a position.",
      },
      {
        title: "Find your way faster",
        detail:
          `Use the desktop sidebar or mobile navigation bar to move between bills, elections, parties, and ${instance.branding.socialName}. The mobile menu keeps less-used pages within reach.`,
      },
      {
        title: "Make it yours",
        detail:
          "Updated artwork gives each area of the game its own look, and your dashboard and profile reflect your current office. Bills, ballots, forms, and dialogs also work better on small screens.",
      },
      {
        title: "The little fixes matter",
        detail:
          "The bill progress bar now distinguishes the presidential stage from the final result. We also refined Election Night layouts, navigation, the footer, and account controls.",
      },
    ],
  },
  {
    version: "0.1.1",
    date: "September 27, 2026",
    dateTime: "2026-09-27",
    headline: "Every change of power has a story.",
    summary: "A clearer record of who held office, and when.",
    highlights: [
      {
        title: "Presidential transitions",
        detail:
          "Admins can replace a sitting President when the game calls for it, with that change preserved in government history.",
      },
      {
        title: "History you can follow",
        detail:
          "Government timelines and player pages now show those transitions, so the story of each administration stays visible.",
      },
    ],
  },
  {
    version: "0.1.0",
    date: "September 27, 2026",
    dateTime: "2026-09-27",
    headline: "Welcome to Polsimmer.",
    summary: "The first release of a political world you can make your own.",
    highlights: [
      {
        title: "A nation to shape",
        detail:
          "Build a political career: form parties, contest elections, write and vote on legislation, and leave your mark on government.",
      },
      {
        title: "A conversation to join",
        detail:
          `Meet other players and make your case on ${instance.branding.socialName}. Polsimmer is self-hostable, so the first instance can be the start of many nations people create themselves.`,
      },
    ],
  },
] as const;

function ChangelogPage() {
  return (
    <WikiPage className="max-w-5xl">
      <WikiHeader
        eyebrow="Release notes"
        title="What’s new in Polsimmer"
        description="New ways to play, small things made better, and the story so far. Polsimmer is a self-hostable political simulation platform. These are updates to the platform, wherever you play it."
      >
        <div className="rounded-lg border bg-card/90 p-4 backdrop-blur-sm sm:p-5">
          <p className="font-serif text-base font-bold sm:text-lg">
            How version numbers work
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Polsimmer is still in its early releases, so its major version
            remains 0. The numbers after it show whether a release adds features
            or focuses on smaller improvements.
          </p>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-md bg-muted/50 px-3 py-2">
              <dt className="font-semibold">0 · Early release</dt>
              <dd className="text-muted-foreground">
                The platform is still evolving.
              </dd>
            </div>
            <div className="rounded-md bg-muted/50 px-3 py-2">
              <dt className="font-semibold">.1 · Feature release</dt>
              <dd className="text-muted-foreground">
                New or changed core gameplay.
              </dd>
            </div>
            <div className="rounded-md bg-muted/50 px-3 py-2">
              <dt className="font-semibold">.2 · Smaller update</dt>
              <dd className="text-muted-foreground">
                Visual refinements, tweaks, and bug fixes.
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            We prefer regular, focused updates over infrequent, oversized
            releases.
          </p>
        </div>
      </WikiHeader>

      <section className="space-y-4 sm:space-y-6" aria-label="Releases">
        {releases.map((release, index) => (
          <article
            key={release.version}
            className="wiki-section overflow-hidden"
            aria-labelledby={`release-${release.version}`}
          >
            <header className="border-b bg-muted/25 px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="rounded-md bg-primary/10 px-2 py-1 font-mono text-xs font-bold text-primary">
                  v{release.version}
                </span>
                {index === 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                    <Sparkles className="size-3.5" /> Latest update
                  </span>
                )}
                <time
                  dateTime={release.dateTime}
                  className="w-full text-xs text-muted-foreground sm:ml-auto sm:w-auto"
                >
                  {release.date}
                </time>
              </div>
              <h2
                id={`release-${release.version}`}
                className="mt-3 font-serif text-xl font-bold leading-tight sm:text-2xl"
              >
                {release.headline}
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {release.summary}
              </p>
            </header>
            <ul className="divide-y px-4 sm:px-6">
              {release.highlights.map((highlight) => (
                <li key={highlight.title} className="py-3.5 sm:py-4">
                  <h3 className="font-semibold">{highlight.title}</h3>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                    {highlight.detail}
                  </p>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <aside
        className="wiki-section px-4 py-5 sm:px-6"
        aria-label="Polsimmer community"
      >
        <h2 className="font-serif text-lg font-bold">
          Keep the conversation going
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Follow platform updates and meet the people building and playing
          Polsimmer.
        </p>
         <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
          <a
             href="https://discord.gg/XREYCNFAdC"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            Polsimmer Discord{" "}
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </a>
         </div>
      </aside>
    </WikiPage>
  );
}
