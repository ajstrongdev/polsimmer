import { instance } from "@/lib/instance-config";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowRightLeft,
  Building2,
  RotateCcw,
  Users,
  Vote,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { WikiArticleSection } from "@/components/wiki/wiki-article-section";
import { PartyLeadership } from "@/components/wiki/party-leadership";
import { MessageDialog } from "@/components/message-dialog";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { SocialAccountAvatar } from "@/components/social/social-account-avatar";
import { ResultBar, WikiHeader } from "@/components/wiki/wiki-header";
import {
  WikiInfobox,
  WikiInfoboxRow,
  WikiPage,
  WikiSection,
} from "@/components/wiki/wiki-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWikiParty } from "@/lib/server/history/history";
import { getWikiArticle } from "@/lib/server/wiki/wiki-articles";
import { getCurrentUserInfo } from "@/lib/server/users/users";
import {
  becomePartyLeader,
  ejectPartyMember,
  getPartyRevivalState,
  leaveParty,
  reviveParty,
} from "@/lib/server/organizations/party";
import {
  decidePartyMembership,
  getPartyGovernance,
  requestPartyMembership,
  startLeadershipBid,
  supportLeadershipBid,
  withdrawLeadershipBid,
} from "@/lib/server/organizations/party-governance";
import { getPartyCoalition } from "@/lib/server/organizations/coalitions";
import { getPrimaryRaces } from "@/lib/server/organizations/primaries";
import { PrimaryRaces } from "@/components/organizations/primary-races";
import { coalitionDesignation } from "@/lib/organizations/coalition-status";
import { EntityReferenceText } from "@/components/entity-reference-text";
import { SocialPartyPosts } from "@/components/social/social-party-posts";
import { getSocialPartyPosts } from "@/lib/server/social/social";
import {
  formatElectionTitle,
  formatWikiDate,
  getVoteShare,
} from "@/lib/utils/history";

export const Route = createFileRoute("/dashboard/parties/$partyId")({
  loader: async ({ params }) => {
    const id = Number(params.partyId);
    if (!Number.isInteger(id))
      throw new Response("Party not found", { status: 404 });
    const [
      party,
      article,
      currentUser,
      coalition,
      revival,
      socialPosts,
      governance,
      primaryRaces,
    ] = await Promise.all([
      getWikiParty({ data: { id } }),
      getWikiArticle({
        data: { entityType: "party", entityId: params.partyId },
      }),
      getCurrentUserInfo(),
      getPartyCoalition({ data: { partyId: id } }),
      getPartyRevivalState({ data: { partyId: id } }),
      getSocialPartyPosts({ data: { partyId: id } }),
      getPartyGovernance({ data: { partyId: id } }),
      getPrimaryRaces(),
    ]);
    if (!party) throw new Response("Party not found", { status: 404 });
    return {
      ...party,
      article,
      currentUser,
      coalition,
      revival,
      socialPosts,
      governance,
      primaryRaces,
    };
  },
  component: PartyArticle,
});

function PartyArticle() {
  const router = useRouter();
  const {
    party,
    members,
    results,
    representation,
    defections,
    article,
    currentUser,
    coalition,
    revival,
    leader,
    socialPosts,
    governance,
    primaryRaces,
  } = Route.useLoaderData();
  return (
    <WikiPage width="article">
      <WikiHeader
        eyebrow={
          party.current ? "Current political party" : "Archived political party"
        }
        title={party.name}
        leading={
          <SocialAccountAvatar
            account="party"
            name={party.name}
            color={party.color}
            logo={party.logo}
            className="size-14 sm:size-20"
          />
        }
        description={
          <EntityReferenceText
            content={
              party.bio ||
               `${party.name} is documented in the ${instance.name} political record.`
            }
          />
        }
        status={
          <Badge variant={party.current ? "default" : "secondary"}>
            {party.current ? "Current" : "Archived"}
          </Badge>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <WikiArticleSection
          entityType="party"
          entityId={String(party.id)}
          article={article}
        />
        <WikiInfobox title={party.name} accent={party.color}>
          <div className="flex justify-center border-b p-5">
            <SocialAccountAvatar
              account="party"
              name={party.name}
              color={party.color}
              logo={party.logo}
              className="size-20"
            />
          </div>
          <WikiInfoboxRow label="Status">
            {party.current ? "Current" : "Archived"}
          </WikiInfoboxRow>
          <WikiInfoboxRow label="Position">
            {party.leaning ?? "Not recorded"}
          </WikiInfoboxRow>
          <WikiInfoboxRow label="Leader">
            {leader ? (
              <Link
                to="/dashboard/players/$playerId"
                params={{ playerId: String(leader.id) }}
                className="inline-flex items-center gap-2 text-primary hover:underline"
              >
                <PlayerAvatar
                  username={leader.username}
                  photoUrl={leader.photoUrl}
                  className="size-7 text-xs"
                />
                {leader.username}
              </Link>
            ) : (
              "No leader"
            )}
          </WikiInfoboxRow>
          {party.current && coalition && (
            <WikiInfoboxRow label={coalitionDesignation(coalition.memberCount)}>
              <Link
                to="/dashboard/parties/coalitions/$id"
                params={{ id: String(coalition.id) }}
                className="text-primary hover:underline"
              >
                {coalition.name}
              </Link>
            </WikiInfoboxRow>
          )}
          <WikiInfoboxRow label="Members">{members.length}</WikiInfoboxRow>
          {party.discord && (
            <WikiInfoboxRow label="Discord">
              <a
                href={party.discord}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Join server
              </a>
            </WikiInfoboxRow>
          )}
          {!party.current && party.archivedAt && (
            <WikiInfoboxRow label="Archived">
              {formatWikiDate(party.archivedAt)}
            </WikiInfoboxRow>
          )}
          {party.current && currentUser && (
            <WikiInfoboxRow label="Organization">
              <PartyActions
                party={party}
                currentUser={currentUser}
                requested={governance.ownRequest}
              />
            </WikiInfoboxRow>
          )}
          {!party.current && revival.canRevive && (
            <WikiInfoboxRow label="Organization">
              <RevivePartyButton partyId={party.id} partyName={party.name} />
            </WikiInfoboxRow>
          )}
        </WikiInfobox>
      </div>
      {party.current && <PrimaryRaces compact title={coalition ? "Coalition primary" : "Party primary"}
        races={primaryRaces.filter((race) => race.partyIds.includes(party.id))} />}
      {party.current && (
        <div id="party-leadership" className="scroll-mt-20">
          <PartyLeadership
            party={party}
            members={members}
            currentUserId={currentUser?.id ?? null}
          />
        </div>
      )}
      {party.current && currentUser && (
        <PartyGovernance
          partyId={party.id}
          partyName={party.name}
          leaderId={party.leaderId}
          currentUser={currentUser}
          governance={governance}
        />
      )}
      <SocialPartyPosts posts={socialPosts} />
      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-sm shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-serif text-2xl">
              <Vote className="h-5 w-5" /> Electoral record
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {results.map((result) => {
              const share = getVoteShare(result.points, result.totalPoints);
              return (
                <Link
                  key={result.historyId}
                  to="/dashboard/elections/$electionId"
                  params={{ electionId: String(result.historyId) }}
                  className="block rounded-lg border p-4 hover:border-primary"
                >
                  <div className="flex justify-between gap-3">
                    <strong>
                      {formatElectionTitle(result.election, result.cycle)}
                    </strong>
                    <Badge variant="outline">{result.elected} elected</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {result.candidates} candidates · {result.firstPreferences}{" "}
                    first preferences · {result.points} points
                  </p>
                  <div className="mt-3">
                    <ResultBar value={share} />
                  </div>
                </Link>
              );
            })}
            {!results.length && (
              <p className="py-8 text-center text-muted-foreground">
                No certified election appearances.
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-sm shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-serif text-2xl">
              <Building2 className="h-5 w-5" /> Representation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {representation.map((snapshot) => (
              <Link
                key={snapshot.historyId}
                to="/dashboard/elections/$electionId"
                params={{ electionId: String(snapshot.historyId) }}
                className="grid grid-cols-[1fr_auto] gap-3 rounded-lg border p-3 hover:border-primary"
              >
                <span className="font-medium">
                  {formatElectionTitle(snapshot.election, snapshot.cycle)}
                </span>
                <span className="font-mono text-xs">
                  House {snapshot.house} · Senate {snapshot.senate} · President{" "}
                  {snapshot.president}
                </span>
              </Link>
            ))}
            {!representation.length && (
              <p className="py-8 text-center text-muted-foreground">
                No government representation recorded.
              </p>
            )}
          </CardContent>
        </Card>
      </section>
      <Card className="rounded-sm shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-serif text-2xl">
            <ArrowRightLeft className="h-5 w-5" /> Defections
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Recorded movements between this party, other parties, and
            Independent status.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {defections.map((defection) => (
            <div
              key={defection.id}
              className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <PlayerAvatar
                    username={defection.username}
                    photoUrl={defection.photoUrl}
                    className="size-9"
                  />
                  {defection.userId ? (
                    <Link
                      to="/dashboard/players/$playerId"
                      params={{ playerId: String(defection.userId) }}
                      className="font-semibold hover:text-primary"
                    >
                      {defection.username}
                    </Link>
                  ) : (
                    <strong>{defection.username}</strong>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <PartyIdentity
                    name={defection.fromPartyName ?? "Independent"}
                    color={defection.fromPartyColor ?? "#64748b"}
                  />
                  <ArrowRight className="h-3.5 w-3.5" />
                  <PartyIdentity
                    name={defection.toPartyName ?? "Independent"}
                    color={defection.toPartyColor ?? "#64748b"}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
                <Badge variant="outline">
                  {defection.fromPartyId === party.id ? "Departed" : "Joined"}
                </Badge>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {formatWikiDate(defection.occurredAt)} · {defection.office}
                </p>
              </div>
            </div>
          ))}
          {!defections.length && (
            <p className="py-8 text-center text-muted-foreground">
              No defections recorded.
            </p>
          )}
        </CardContent>
      </Card>
      {party.current && (
        <Card className="rounded-sm shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-serif text-2xl">
              <Users className="h-5 w-5" /> Current members
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {members.map((member) => (
              <div key={member.id} className="flex items-center gap-2">
                <Link
                  to="/dashboard/players/$playerId"
                  params={{ playerId: String(member.id) }}
                  className="flex flex-1 justify-between rounded-md border p-3 hover:border-primary"
                >
                  <span className="flex items-center gap-2">
                    <PlayerAvatar
                      username={member.username}
                      photoUrl={member.photoUrl}
                      className="size-8 text-xs"
                    />
                    <strong>{member.username}</strong>
                  </span>
                  <Badge variant="outline">{member.role}</Badge>
                </Link>
                {currentUser?.id === party.leaderId &&
                  member.id !== currentUser.id && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={async () => {
                        if (
                          !window.confirm(
                            `Eject ${member.username} from ${party.name}?`,
                          )
                        )
                          return;
                        try {
                          await ejectPartyMember({
                            data: { partyId: party.id, userId: member.id },
                          });
                          await router.invalidate();
                        } catch (error) {
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Could not eject member",
                          );
                        }
                      }}
                    >
                      Expel
                    </Button>
                  )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </WikiPage>
  );
}

function RevivePartyButton({
  partyId,
  partyName,
}: {
  partyId: number;
  partyName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  return (
    <>
      <Button
        variant="link"
        className="h-auto p-0"
        disabled={submitting}
        onClick={() => setOpen(true)}
      >
        <RotateCcw className="mr-1 h-3.5 w-3.5" />
        Revive party
      </Button>
      <MessageDialog
        open={open}
        onOpenChange={setOpen}
        title={`Revive ${partyName}`}
        description="This restores the party with you as its sole member and leader. Its identity, platform, and stances remain intact."
        confirmText="Revive party"
        onConfirm={async () => {
          setSubmitting(true);
          try {
            await reviveParty({ data: { partyId } });
            toast.success(`${partyName} revived`);
            await router.invalidate();
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : "Could not revive party",
            );
          } finally {
            setSubmitting(false);
          }
        }}
      />
    </>
  );
}

function PartyActions({
  party,
  currentUser,
  requested,
}: {
  party: {
    id: number;
    leaderId: number | null;
    name: string;
    color: string;
    bio: string | null;
    logo: string | null;
    leaning: string | null;
  };
  currentUser: {
    id: number;
    partyId: number | null;
  };
  requested: boolean;
}) {
  const router = useRouter();
  const isMember = currentUser.partyId === party.id;
  const refresh = () => router.invalidate();
  const [showMembershipDialog, setShowMembershipDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const changeMembership = async () => {
    setSubmitting(true);
    try {
      if (isMember) {
        await leaveParty({ data: { userId: currentUser.id } });
        toast.success("You are now an independent");
      } else {
        await requestPartyMembership({ data: { partyId: party.id } });
        toast.success("Membership request sent to the Party Leader");
      }
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update membership",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      {isMember && !party.leaderId && (
        <Button
          variant="link"
          className="h-auto p-0"
          onClick={async () => {
            await becomePartyLeader({
              data: { userId: currentUser.id, partyId: party.id },
            });
            await refresh();
          }}
        >
          Claim leadership
        </Button>
      )}
      {isMember ? (
        <Button
          variant="link"
          className="h-auto p-0 text-red-700 dark:text-red-400"
          onClick={() => setShowMembershipDialog(true)}
          disabled={submitting}
        >
          Leave party
        </Button>
      ) : (
        <Button
          variant="link"
          className="h-auto p-0"
          onClick={() => setShowMembershipDialog(true)}
          disabled={submitting || requested}
        >
          {requested ? "Request pending" : "Request to join"}
        </Button>
      )}
      <MessageDialog
        open={showMembershipDialog}
        onOpenChange={setShowMembershipDialog}
        title={isMember ? "Leave party" : `Request to join ${party.name}`}
        description={
          isMember
            ? "You will become an independent. If you lead this party, its leadership will become vacant."
            : `The Party Leader must approve your request. Approval will transfer you from any current party or pressure group.`
        }
        confirmText={isMember ? "Leave party" : "Send request"}
        variant={isMember ? "destructive" : "default"}
        onConfirm={changeMembership}
      />
    </div>
  );
}

function PartyGovernance({
  partyId,
  partyName,
  leaderId,
  currentUser,
  governance,
}: {
  partyId: number;
  partyName: string;
  leaderId: number | null;
  currentUser: { id: number; partyId: number | null };
  governance: Awaited<ReturnType<typeof getPartyGovernance>>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const act = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      await router.invalidate();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not update party governance",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {currentUser.id === leaderId && (
        <div id="membership-requests" className="col-span-full scroll-mt-20">
          <WikiSection
            title="Membership requests"
            description="Only the Party Leader can accept or decline applicants."
          >
            <div className="space-y-3">
              {governance.requests.map((request) => (
                <div
                  key={request.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border p-3"
                >
                  <PlayerAvatar
                    username={request.username}
                    photoUrl={request.photoUrl}
                    className="size-8"
                  />
                  <span className="flex-1 font-medium">{request.username}</span>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      act(
                        () =>
                          decidePartyMembership({
                            data: { requestId: request.id, approve: true },
                          }),
                        `${request.username} joined ${partyName}`,
                      )
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      act(
                        () =>
                          decidePartyMembership({
                            data: { requestId: request.id, approve: false },
                          }),
                        "Request declined",
                      )
                    }
                  >
                    Decline
                  </Button>
                </div>
              ))}
              {!governance.requests.length && (
                <p className="text-sm text-muted-foreground">
                  No pending requests.
                </p>
              )}
            </div>
          </WikiSection>
        </div>
      )}
      {currentUser.partyId === partyId && leaderId !== null && (
        <WikiSection
          title={
            governance.bid ? "Leadership contested" : "Leadership challenge"
          }
          description={
            governance.bid
              ? "A challenge to the party leader is underway."
              : "A member can challenge the leader with the support of half the party."
          }
          className={
            governance.bid
              ? "col-span-full border-l-4 border-l-destructive"
              : "col-span-full"
          }
        >
          {governance.bid ? (
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
              <div className="min-w-0">
                <h3 className="font-serif text-2xl font-semibold tracking-tight">
                  {governance.bid.candidate} has challenged the party leader
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  If enough members back the challenge,{" "}
                  {governance.bid.candidate} becomes leader immediately. The
                  current leader stays in the party as a regular member.
                </p>
                <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t pt-4">
                  <span className="font-serif text-3xl font-semibold tabular-nums">
                    {governance.bid.supportCount}{" "}
                    <span className="text-lg font-normal text-muted-foreground">
                      / {governance.bid.threshold}
                    </span>
                  </span>
                  <span className="text-sm text-muted-foreground">
                    members supporting the challenge · threshold set when it
                    began
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 md:max-w-56 md:justify-end">
                {!governance.bid.hasSupported && governance.bid.canSupport && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      act(
                        () =>
                          supportLeadershipBid({
                            data: { bidId: governance.bid!.id },
                          }),
                        "Support recorded",
                      )
                    }
                  >
                    Support the challenge
                  </Button>
                )}
                {governance.bid.hasSupported && (
                  <p className="text-sm font-medium">
                    You support this challenge.
                  </p>
                )}
                {!governance.bid.canSupport && (
                  <p className="text-sm text-muted-foreground">
                    Only members present when the bid launched can support it.
                  </p>
                )}
                {currentUser.id === governance.bid.candidateId && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      act(
                        () =>
                          withdrawLeadershipBid({
                            data: { bidId: governance.bid!.id },
                          }),
                        "Leadership bid withdrawn",
                      )
                    }
                  >
                    Withdraw bid
                  </Button>
                )}
              </div>
            </div>
          ) : currentUser.id !== leaderId ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                act(
                  () => startLeadershipBid({ data: { partyId } }),
                  "Leadership bid started",
                )
              }
            >
              Launch leadership bid
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              No active leadership bid.
            </p>
          )}
        </WikiSection>
      )}
    </div>
  );
}

function PartyIdentity({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="truncate">{name}</span>
    </span>
  );
}
