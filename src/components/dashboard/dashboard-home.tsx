import { instance } from "@/lib/instance-config";
import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import {
  Activity,
  ArrowRight,
  BellRing,
  CheckCircle2,
  ClipboardCheck,
  Crown,
  Landmark,
  MailPlus,
  Megaphone,
  MessageSquareText,
  Radio,
  Scale,
  ScrollText,
  ShieldCheck,
  Users,
  Vote,
} from "lucide-react";
import type { getDashboardData } from "@/lib/server/dashboard/data";
import {
  CompactCandidacyStatus,
  DashboardElectionBallot,
  DashboardElectionHub,
  isElectionNightActive,
} from "@/components/dashboard/dashboard-election-hub";
import { DashboardActionDeadline } from "@/components/dashboard/dashboard-action-deadline";
import { DashboardPrimaryAction } from "@/components/dashboard/dashboard-primary-action";
import { PrimaryRaces } from "@/components/organizations/primary-races";
import { DashboardSocialPostDialog } from "@/components/dashboard/dashboard-social-post-dialog";
import { NewBillDialog } from "@/components/wiki/new-bill-dialog";
import { ResultBar, WikiHeader } from "@/components/wiki/wiki-header";
import {
  WikiEmpty,
  WikiPage,
  WikiSection,
  WikiStat,
  WikiStatGrid,
} from "@/components/wiki/wiki-layout";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { ZNotifications } from "@/components/social/z-notifications";
import { Button } from "@/components/ui/button";
import { AccountSettingsDialog } from "@/components/settings/account-settings-dialog";
import { getFeedItems } from "@/lib/server/dashboard/feed";
import { getFeedDestination } from "@/lib/feed-destination";
import { DashboardBillVoteAction } from "@/components/dashboard/dashboard-bill-vote-action";
import { billStatusLabel } from "@/components/bills/bill-stage-countdown";
import { electionNextMoves } from "@/lib/dashboard/action-eligibility";
import { featuredOffice, officeArtwork } from "@/lib/masthead-artwork";

dayjs.extend(relativeTime);

function LiveLabel() {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[0.65rem] font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
      </span>
      Live
    </span>
  );
}

function formatGreetingRole(role: string | null | undefined) {
  if (role === "President") return "President";
  if (role === "Senator") return "Sen.";
  if (role === "Representative") return "Rep.";
  return role ?? "Citizen";
}

export function DashboardContent({
  data,
}: {
  data: Awaited<ReturnType<typeof getDashboardData>>;
}) {
  const router = useRouter();
  const {
    currentUser,
    pendingBillVotes,
    pendingCommitteeAssessments,
    pendingBillGuidance,
    pendingPartyJoinRequests,
    pendingCoalitionJoinRequests,
    vacantPartyOffices,
    partyFormationInvites,
    pendingCoalitionProposals,
    primaryActions,
    primaryRaces,
    zMentionSummary,
    activity,
    electionDashboard,
    recentBills,
    nation,
  } = data;
  const { votes: electionVotes, candidacies: nationalCandidacies } =
    electionNextMoves(electionDashboard, currentUser);
  const partyPrompt = Boolean(currentUser?.active && !currentUser.partyId);
  const actionCount =
    pendingBillVotes.length +
    pendingCommitteeAssessments.length +
    pendingBillGuidance.length +
    pendingPartyJoinRequests.length +
    pendingCoalitionJoinRequests.length +
    vacantPartyOffices.length +
    partyFormationInvites.length +
    pendingCoalitionProposals.length +
    Number(primaryActions.stand) +
    Number(primaryActions.withdraw) +
    Number(primaryActions.vote) +
    electionVotes.length +
    nationalCandidacies.length +
    Number(partyPrompt);
  const electionNight = isElectionNightActive(electionDashboard);
  const [activityItems, setActivityItems] = useState(() =>
    activity.slice(0, 6),
  );
  const [hasMoreActivity, setHasMoreActivity] = useState(activity.length > 6);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [activityError, setActivityError] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    const latest = activity.slice(0, 6);
    const visible = new Set(latest.map((item) => item.id));
    // Refresh changed records without collapsing pages the reader already opened.
    setActivityItems((current) => [
      ...latest,
      ...current.filter((item) => !visible.has(item.id)),
    ]);
  }, [activity]);

  const loadMoreActivity = async () => {
    if (loadingActivity) return;
    setLoadingActivity(true);
    setActivityError(false);
    try {
      const next = await getFeedItems({
        data: { limit: 7, offset: activityItems.length },
      });
      setActivityItems((current) => {
        const visible = new Set(current.map((item) => item.id));
        return [
          ...current,
          ...next.slice(0, 6).filter((item) => !visible.has(item.id)),
        ];
      });
      setHasMoreActivity(next.length > 6);
    } catch {
      setActivityError(true);
    } finally {
      setLoadingActivity(false);
    }
  };

  return (
    <WikiPage>
      {electionNight && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-600/10 px-4 py-3">
          <Radio className="h-4 w-4 animate-pulse text-red-700 dark:text-red-400" />
          <p className="text-sm font-semibold text-red-700 dark:text-red-400">
            Election night is live — results are coming in now
          </p>
        </div>
      )}

      <WikiHeader
        artwork={officeArtwork(currentUser?.role)}
        office={featuredOffice(currentUser?.role)}
        eyebrow={
          currentUser?.role === "President"
            ? "Office of the President"
            : currentUser?.role === "Senator"
              ? "The Senate"
              : undefined
        }
        title={
          currentUser
            ? `Welcome back, ${formatGreetingRole(currentUser.role)} ${currentUser.username}`
            : `Welcome to ${instance.name}.`
        }
        description={
          currentUser
            ? actionCount
              ? `You have ${actionCount} ${actionCount === 1 ? "action" : "actions"} to take. Start below.`
              : `You're caught up. Explore what's happening in ${instance.name} below.`
            : "See what's happening and learn how to play."
        }
        status={!electionNight ? <LiveLabel /> : undefined}
      >
        {currentUser && (
          <WikiStatGrid>
            <WikiStat label="Office" value={currentUser.role ?? "Citizen"} />
            <WikiStat
              label="Party"
              value={currentUser.partyName ?? "Independent"}
              detail={currentUser.politicalLeaning ?? undefined}
            />
            <WikiStat
              label="Pending actions"
              value={
                <a href="#next-moves" className="text-primary hover:underline">
                  {actionCount}
                </a>
              }
            />
            <WikiStat
              label="Player record"
              value={
                <Link
                  to="/dashboard/players/$playerId"
                  params={{ playerId: String(currentUser.id) }}
                  className="text-primary hover:underline"
                >
                  View profile
                </Link>
              }
            />
          </WikiStatGrid>
        )}
      </WikiHeader>

      {currentUser && (
        <div
          id="next-moves"
          className="grid scroll-mt-20 items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(19rem,1fr)]"
        >
          <WikiSection
            title="Your next moves"
            icon={BellRing}
            description="Decisions currently waiting for you. Completed actions disappear."
            className="flex h-full flex-col [&>.wiki-section-content]:flex-1"
            aside={
              <span className="font-mono text-xs text-muted-foreground">
                {actionCount} pending
              </span>
            }
          >
            {actionCount ? (
              <div className="divide-y border-y">
                {partyPrompt && (
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-primary/[0.035] px-4 py-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <Users className="mt-0.5 size-4 shrink-0 text-primary" />
                      <div>
                        <p className="font-semibold">
                          Find your place in {instance.name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Join a party or create one to shape the nation
                          together.
                        </p>
                      </div>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/dashboard/parties">
                        Explore parties <ArrowRight className="size-3.5" />
                      </Link>
                    </Button>
                  </div>
                )}
                {partyFormationInvites.map((invite) => (
                  <div
                    key={`formation-${invite.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"
                  >
                    <span className="font-semibold">
                      {invite.founder} invited you to found {invite.name} as{" "}
                      {invite.office}
                    </span>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/dashboard/parties">Respond to invitation</Link>
                    </Button>
                  </div>
                ))}
                {pendingPartyJoinRequests.map((request) => (
                  <Link
                    key={`party-request-${request.id}`}
                    to="/dashboard/parties/$partyId"
                    params={{ partyId: String(currentUser.partyId) }}
                    hash="membership-requests"
                    className="group flex items-center justify-between gap-3 px-4 py-4 hover:bg-muted/30"
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <Users className="size-4 text-primary" /> Review a party
                      membership request
                    </span>
                    <span className="text-sm font-semibold text-primary">
                      Review request →
                    </span>
                  </Link>
                ))}
                {vacantPartyOffices.map((role) => (
                  <Link
                    key={`party-office-${role.office}`}
                    to="/dashboard/parties/$partyId"
                    params={{ partyId: String(currentUser.partyId) }}
                    hash="party-leadership"
                    className="group flex items-center justify-between gap-3 px-4 py-4 hover:bg-muted/30"
                  >
                    <span className="font-semibold">Appoint a {role.title} for your party</span>
                    <span className="text-sm font-semibold text-primary">Manage officers →</span>
                  </Link>
                ))}
                {primaryActions.stand && (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                    <span className="space-y-1">
                      <span className="block font-semibold">
                        Stand in your presidential primary
                      </span>
                      <DashboardActionDeadline
                        deadline={primaryActions.deadline}
                        onExpire={() => void router.invalidate()}
                      />
                    </span>
                    <DashboardPrimaryAction />
                  </div>
                )}
                {primaryActions.withdraw && (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                    <span className="space-y-1">
                      <span className="block font-semibold">
                        Withdraw from your presidential primary
                      </span>
                      <DashboardActionDeadline
                        deadline={primaryActions.deadline}
                        onExpire={() => void router.invalidate()}
                      />
                    </span>
                    <DashboardPrimaryAction withdraw />
                  </div>
                )}
                {primaryActions.vote && (
                  <Link
                    to="/dashboard/parties/primaries"
                    className="flex items-center justify-between gap-3 px-4 py-4 hover:bg-muted/30"
                  >
                    <span className="space-y-1">
                      <span className="block font-semibold">
                         Vote in your {primaryRaces.find((race) => race.canVote)?.kind ?? "party"} presidential primary
                      </span>
                      <DashboardActionDeadline
                        deadline={primaryActions.deadline}
                        onExpire={() => void router.invalidate()}
                      />
                    </span>
                    <span className="text-sm font-semibold text-primary">
                      Vote now →
                    </span>
                  </Link>
                )}
                {nationalCandidacies.map((race) => (
                  <div
                    key={`declare-${race.election}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"
                  >
                    <span className="space-y-1">
                      <span className="flex items-center gap-2 font-semibold">
                        {race.election === "Senate" ? (
                          <Landmark className="size-4 shrink-0 text-primary" />
                        ) : (
                          <Crown className="size-4 shrink-0 text-primary" />
                        )}{" "}
                        Stand in the {race.election} election
                      </span>
                      <DashboardActionDeadline
                        deadline={race.timestamps.candidacyEndsAt}
                        onExpire={() => void router.invalidate()}
                      />
                    </span>
                    <CompactCandidacyStatus
                      race={race}
                      races={electionDashboard.races}
                      currentUser={currentUser}
                      onActionComplete={() => void router.invalidate()}
                    />
                  </div>
                ))}
                {electionVotes.map((race) => (
                  <div
                    key={race.election}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"
                  >
                    <span className="space-y-1">
                      <span className="block font-semibold">
                        Vote in the {race.election} election
                      </span>
                      <DashboardActionDeadline
                        deadline={race.timestamps.votingEndsAt}
                        onExpire={() => void router.invalidate()}
                        electionVoting
                      />
                    </span>
                    <DashboardElectionBallot
                      race={race}
                      currentUser={currentUser}
                    />
                  </div>
                ))}
                {pendingBillVotes.map((bill) => (
                  <div
                    key={`bill-${bill.id}`}
                    className="flex flex-col gap-3 px-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-4"
                  >
                    <div className="flex min-w-0 gap-3">
                      <Vote className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <Link
                          to="/dashboard/bills/$billId"
                          params={{ billId: String(bill.id) }}
                          className="font-semibold text-primary hover:underline"
                        >
                          Vote on {bill.title}
                        </Link>
                        <p className="text-sm text-muted-foreground">
                          A vote is waiting in the {bill.chamber}.
                        </p>
                        <DashboardActionDeadline
                          deadline={bill.stageEndsAt}
                          onExpire={() => void router.invalidate()}
                        />
                      </div>
                    </div>
                    <DashboardBillVoteAction
                      billId={bill.id}
                      title={bill.title}
                      stage={bill.stage}
                      userId={currentUser.id}
                      enforcedPosition={bill.enforcedPosition}
                    />
                  </div>
                ))}
                {pendingCommitteeAssessments.map((bill) => (
                  <Link
                    key={`assessment-${bill.id}`}
                    to="/dashboard/bills/$billId"
                    params={{ billId: String(bill.id) }}
                    className="group flex flex-col gap-3 px-3 py-4 hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between sm:px-4"
                  >
                    <div className="flex min-w-0 gap-3">
                      <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="font-semibold">Assess {bill.title}</p>
                        <p className="text-sm text-muted-foreground">
                          The Senate Committee is waiting for your assessment of
                          this bill's national effects.
                        </p>
                        <DashboardActionDeadline
                          deadline={bill.stageEndsAt}
                          onExpire={() => void router.invalidate()}
                        />
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                      Open assessment
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </Link>
                ))}
                {pendingBillGuidance.map((bill) => (
                  <Link
                    key={`guidance-${bill.id}`}
                    to="/dashboard/bills/$billId"
                    params={{ billId: String(bill.id) }}
                    hash="party-guidance"
                    className="group flex flex-col gap-3 px-3 py-4 hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between sm:px-4"
                  >
                    <div className="flex min-w-0 gap-3">
                      <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="font-semibold">
                          Issue voting guidance for {bill.title}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Recommend a vote to your party during the{" "}
                          {bill.stage === "Presidential"
                            ? "presidential"
                            : bill.stage}{" "}
                          stage.
                        </p>
                        <DashboardActionDeadline
                          deadline={bill.stageEndsAt}
                          onExpire={() => void router.invalidate()}
                        />
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                      Issue guidance{" "}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </Link>
                ))}
                {pendingCoalitionProposals.map((proposal) => (
                  <Link
                    key={`coalition-${proposal.id}`}
                    to="/dashboard/parties/coalitions/$id"
                    params={{ id: String(proposal.coalitionId) }}
                    hash="proposals"
                    className="group flex items-center justify-between gap-3 px-4 py-4 hover:bg-muted/30"
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <Users className="size-4 text-primary" /> Vote on a
                      coalition {proposal.proposalType.replaceAll("_", " ")}{" "}
                      proposal
                    </span>
                    <span className="text-sm font-semibold text-primary">
                      Review proposal →
                    </span>
                  </Link>
                ))}
                {pendingCoalitionJoinRequests.map((request) => (
                  <Link
                    key={`coalition-request-${request.id}`}
                    to="/dashboard/parties/coalitions/$id"
                    params={{ id: String(request.coalitionId) }}
                    hash="requests"
                    className="group flex items-center justify-between gap-3 px-4 py-4 hover:bg-muted/30"
                  >
                    <span className="font-semibold">Propose accepting {request.partyName} into your coalition</span>
                    <span className="text-sm font-semibold text-primary">Review request →</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 border border-dashed px-4 py-6 text-sm text-muted-foreground">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                You are caught up. New pending decisions will appear here.
              </div>
            )}
          </WikiSection>

          <WikiSection
            title="Your notifications"
            icon={MessageSquareText}
            description="Mentions and comments on your posts."
            className="flex h-full flex-col [&>.wiki-section-content]:flex-1"
          >
            <div id="z-notifications" className="scroll-mt-24"><ZNotifications initialPage={zMentionSummary} /></div>
          </WikiSection>
        </div>
      )}

      {nation && (
        <WikiSection
          title="National health"
          icon={Scale}
          description="A quick snapshot of the country's current condition."
          aside={
            <Link
              to="/dashboard/nation"
              className="text-sm font-semibold text-primary hover:underline"
            >
              Full report <ArrowRight className="inline size-3.5" />
            </Link>
          }
        >
          <div className="grid gap-px border bg-border sm:grid-cols-3">
            {[
              {
                label: "Civil rights",
                value: nation.civilRights,
                icon: ShieldCheck,
              },
              { label: "Economy", value: nation.economy, icon: Activity },
              {
                label: "Political freedoms",
                value: nation.politicalFreedoms,
                icon: Landmark,
              },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="wiki-kicker">{label}</p>
                    <p className="mt-1 font-serif text-2xl font-bold">
                      {Math.round(value)}
                    </p>
                  </div>
                  <Icon className="size-4 text-primary" />
                </div>
                <div className="mt-3">
                  <ResultBar value={value} />
                </div>
              </div>
            ))}
          </div>
        </WikiSection>
      )}

      {currentUser && (
        <WikiSection
          title="Take initiative"
          icon={Users}
          description="Start something new, or invite another player into the game."
        >
          {currentUser?.active && (
            <section className="mb-5" aria-labelledby="take-initiative-heading">
              <h3 id="take-initiative-heading" className="sr-only">
                Take initiative
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <NewBillDialog
                  userId={currentUser.id}
                  dashboardCommand
                  trigger={
                    <button
                      type="button"
                      className="group flex min-h-[4.5rem] min-w-0 items-center gap-3 rounded-lg border bg-card px-3 py-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/30 sm:px-4"
                    >
                      <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">
                          Draft a bill
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          Submit a proposal to the Senate Committee.
                        </span>
                      </span>
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100 group-hover:text-primary" />
                    </button>
                  }
                />
                <DashboardSocialPostDialog user={currentUser} />
              </div>
            </section>
          )}

          {currentUser && (
            <div className="mt-3 flex flex-wrap justify-end gap-1">
              {instance.social.community && <Button
                asChild
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
              >
                <a
                  href={instance.social.community}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageSquareText className="size-3.5" /> {instance.name} Discord
                </a>
              </Button>}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => setInviteOpen(true)}
              >
                <MailPlus className="size-3.5" /> Invite a player
              </Button>
            </div>
          )}
          {currentUser && (
            <AccountSettingsDialog
              open={inviteOpen}
              onOpenChange={setInviteOpen}
              initialTab="invites"
            />
          )}
        </WikiSection>
      )}

      <PrimaryRaces races={primaryRaces} />

      <div
        className={
          electionNight
            ? "space-y-6"
            : "grid items-stretch gap-6 lg:grid-cols-2"
        }
      >
        <WikiSection
          title="Bill status"
          icon={ScrollText}
          description="Where current proposals stand. Your votes appear above."
          aside={
            <Link
              to="/dashboard/bills"
              className="text-sm font-semibold text-primary hover:underline"
            >
              All bills
            </Link>
          }
          className="h-full"
        >
          {recentBills.length ? (
            <div className="divide-y border-y">
              {recentBills.map((bill) => (
                <Link
                  key={bill.id}
                  to="/dashboard/bills/$billId"
                  params={{ billId: String(bill.id) }}
                  className="flex min-w-0 flex-col items-start gap-1 px-4 py-3 text-sm hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <span className="min-w-0 break-words font-medium">
                    #{bill.id} {bill.title}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {billStatusLabel(bill.status)} ·{" "}
                    {bill.stage === "Committee"
                      ? "Senate Committee"
                      : bill.stage}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <WikiEmpty>No bills yet.</WikiEmpty>
          )}
        </WikiSection>

        <DashboardElectionHub
          initialData={electionDashboard}
          currentUser={currentUser}
          actionsInQueue
        />
      </div>

      <WikiSection
        title="Latest activity"
        icon={BellRing}
        aside={<LiveLabel />}
      >
        <div>
          {activityItems.map((item) => (
            <a
              key={item.id}
              href={getFeedDestination(item.content, item.userId)}
              className="wiki-record-row group flex flex-col gap-2 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-primary sm:flex-row sm:items-start sm:justify-between sm:gap-4"
            >
              <div className="flex min-w-0 items-start gap-3">
                {item.username && (
                  <PlayerAvatar
                    username={item.username}
                    photoUrl={item.photoUrl}
                    className="size-12"
                  />
                )}
                <p className="min-w-0 pt-1 text-sm leading-relaxed">
                  <span className="font-semibold">
                    {item.username ?? "System"}
                  </span>
                  {": "}
                  <span className="text-muted-foreground">{item.content}</span>
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-2">
                <time
                  className="font-mono text-xs text-muted-foreground"
                  dateTime={
                    item.createdAt
                      ? new Date(item.createdAt).toISOString()
                      : undefined
                  }
                  title={
                    item.createdAt
                      ? dayjs(item.createdAt).format("MMMM D, YYYY h:mm A")
                      : undefined
                  }
                >
                  {item.createdAt ? dayjs(item.createdAt).fromNow() : "Unknown"}
                </time>
                <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  View details <ArrowRight className="size-3.5" />
                </span>
              </span>
            </a>
          ))}
          {!activityItems.length && (
            <WikiEmpty>No activity has been recorded yet.</WikiEmpty>
          )}
          {activityError && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              Could not load more activity. Please try again.
            </p>
          )}
          <div className="mt-5 flex justify-center">
            <Button
              type="button"
              size="lg"
              className="w-full min-w-52 font-semibold sm:w-auto"
              disabled={!hasMoreActivity || loadingActivity}
              onClick={loadMoreActivity}
            >
              {loadingActivity
                ? "Loading…"
                : hasMoreActivity
                  ? "Load more activity"
                  : "All activity loaded"}
            </Button>
          </div>
        </div>
      </WikiSection>
    </WikiPage>
  );
}
