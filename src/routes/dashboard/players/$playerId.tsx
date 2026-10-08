import { instance } from "@/lib/instance-config";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Crown, FileText, UserPlus, Vote } from "lucide-react";
import { toast } from "sonner";
import { WikiArticleSection } from "@/components/wiki/wiki-article-section";
import { PartyMark, WikiHeader } from "@/components/wiki/wiki-header";
import {
  WikiEmpty,
  WikiInfobox,
  WikiInfoboxRow,
  WikiPage,
  WikiSection,
} from "@/components/wiki/wiki-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReportPlayerDialog } from "@/components/players/report-player-dialog";
import { PlayerAvatar } from "@/components/players/player-avatar";
import {
  PlayerLastSeen,
  usePlayerPresenceData,
  usePresenceClock,
} from "@/components/players/player-last-seen";
import { getWikiPlayer } from "@/lib/server/history/history";
import { getWikiArticle } from "@/lib/server/wiki/wiki-articles";
import {
  formatElectionTitle,
  formatWikiDate,
  getOfficeTerms,
  getPartyTerms,
  getVoteShare,
} from "@/lib/utils/history";
import { EntityReferenceText } from "@/components/entity-reference-text";
import { SocialPlayerPosts } from "@/components/social/social-player-posts";
import { getSocialProfile, toggleSocialFollow } from "@/lib/server/social/social";
import { featuredOffice, officeArtwork } from "@/lib/masthead-artwork";

export const Route = createFileRoute("/dashboard/players/$playerId")({
  loader: async ({ params }) => {
    const id = Number(params.playerId);
    if (!Number.isInteger(id))
      throw new Response("Player not found", { status: 404 });
    const [playerData, article, socialProfile] = await Promise.all([
      getWikiPlayer({ data: { id } }),
      getWikiArticle({
        data: { entityType: "player", entityId: params.playerId },
      }),
      getSocialProfile({ data: { userId: id } }),
    ]);
    if (!playerData) throw new Response("Player not found", { status: 404 });
    return { playerData, article, socialProfile };
  },
  component: PlayerArticle,
});

function PlayerArticle() {
  const [bioExpanded, setBioExpanded] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const { playerData, article, socialProfile } = Route.useLoaderData();
  const [following, setFollowing] = useState(socialProfile?.viewerFollows ?? false);
  useEffect(() => {
    setFollowing(socialProfile?.viewerFollows ?? false);
  }, [socialProfile?.id, socialProfile?.viewerFollows]);
  const now = usePresenceClock();
  const presence = usePlayerPresenceData(playerData.player.id);
  const {
    player,
    candidacies,
    offices,
    roleChanges,
    partyHistory,
    authoredBills,
    billVotes,
  } = playerData;
  const firstChange = [...roleChanges].sort(
    (a, b) =>
      new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  )[0];
  const officeTerms = getOfficeTerms(
    [
      ...offices,
      ...(firstChange?.fromOffice &&
      !offices.some(
        (office) =>
          new Date(office.concludedAt) < new Date(firstChange.occurredAt),
      )
        ? [
            {
              historyId: -firstChange.coupId,
              election: "Coup",
              cycle: 0,
              concludedAt: player.createdAt ?? firstChange.occurredAt,
              office: firstChange.fromOffice,
              selection: "Serving",
            },
          ]
        : []),
      ...roleChanges.map((change) => ({
        historyId: -change.coupId,
        election: "Coup",
        cycle: 0,
        concludedAt: change.occurredAt,
        office: change.toOffice,
        selection: "Coup",
      })),
    ],
    player.role,
  );
  const partyTerms = getPartyTerms(
    [
      ...offices.map((office) => ({
        at: office.concludedAt,
        partyId: office.partyId,
        partyName: office.partyName,
        partyColor: office.partyColor,
      })),
      ...partyHistory.map((event) => ({
        at: event.occurredAt,
        partyId: event.toPartyId,
        partyName: event.toPartyName,
        partyColor: event.toPartyColor,
      })),
    ],
    {
      partyId: player.partyId,
      partyName: player.partyName,
      partyColor: player.partyColor,
    },
    player.createdAt,
  );

  return (
    <WikiPage width="article">
      <WikiHeader
        artwork={officeArtwork(player.role)}
        office={featuredOffice(player.role)}
        eyebrow={player.role === "President" ? "President · Player article" : player.role === "Senator" ? "Senator · Player article" : "Player article"}
        title={player.username}
        description={
          <>
            <span
              className={
                bioExpanded
                  ? "block break-words"
                  : "block line-clamp-3 break-words"
              }
            >
              <EntityReferenceText
                 content={player.bio || `A player in ${instance.name}.`}
              />
            </span>
            {(player.bio?.length ?? 0) > 180 && (
              <button
                type="button"
                className="mt-1 font-medium text-primary hover:underline"
                onClick={() => setBioExpanded(!bioExpanded)}
              >
                {bioExpanded ? "Show less" : "Read full bio"}
              </button>
            )}
          </>
        }
        status={
          <div className="flex items-center gap-2">
            {socialProfile?.viewerId && socialProfile.viewerId !== player.id && player.isActive && (
              <Button type="button" size="sm" variant={following ? "outline" : "default"} disabled={followBusy} onClick={async () => {
                setFollowBusy(true);
                try {
                  const result = await toggleSocialFollow({ data: { userId: player.id } });
                  setFollowing(result.following);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not update follow");
                } finally {
                  setFollowBusy(false);
                }
              }}>
                {!following && <UserPlus className="size-4" />}
                {following ? "Following" : `Follow on ${instance.branding.socialName}`}
              </Button>
            )}
            <Badge
              variant={
                player.archivedAt || !player.isActive ? "secondary" : "default"
              }
            >
              {!player.isActive
                ? "Suspended"
                : player.archivedAt
                  ? "Archived"
                  : "Active"}
            </Badge>
            <ReportPlayerDialog
              playerId={player.id}
              username={player.username}
            />
          </div>
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <WikiArticleSection
          entityType="player"
          entityId={String(player.id)}
          article={article}
        />
        <WikiInfobox title={player.username} accent={player.partyColor} artwork={officeArtwork(player.role)}>
          <div className="flex justify-center border-b p-5">
            <PlayerAvatar
              username={player.username}
              photoUrl={player.photoUrl}
              className="size-28 text-3xl"
            />
          </div>
          <WikiInfoboxRow label="Office">
            {player.role ?? "Representative"}
          </WikiInfoboxRow>
          <WikiInfoboxRow label="Pronouns">
            {player.pronouns ?? "Not specified"}
          </WikiInfoboxRow>
          <WikiInfoboxRow label="Party">
            {player.partyId ? (
              <Link
                to="/dashboard/parties/$partyId"
                params={{ partyId: String(player.partyId) }}
                className="hover:text-primary"
              >
                <PartyMark name={player.partyName} color={player.partyColor} />
              </Link>
            ) : (
              <PartyMark name={null} color={null} />
            )}
          </WikiInfoboxRow>
          <WikiInfoboxRow label="Leaning">
            {player.politicalLeaning ?? "Not stated"}
          </WikiInfoboxRow>
          <WikiInfoboxRow label="Joined">
            {player.createdAt ? formatWikiDate(player.createdAt) : "Unknown"}
          </WikiInfoboxRow>
          <WikiInfoboxRow label="Last seen">
            <PlayerLastSeen
              presence={presence[player.id] ?? player}
              now={now}
            />
          </WikiInfoboxRow>
          <WikiInfoboxRow label="Bills">{authoredBills.length}</WikiInfoboxRow>
          <WikiInfoboxRow label="Votes">{billVotes.length}</WikiInfoboxRow>
        </WikiInfobox>
      </div>

      <SocialPlayerPosts posts={socialProfile?.posts ?? []} />

      <section className="grid gap-6 lg:grid-cols-2">
        <WikiSection title="Election record" icon={Vote}>
          <div>
            {candidacies.map((race) => {
              const share = getVoteShare(race.points, race.totalPoints);
              return (
                <Link
                  key={race.historyId}
                  to="/dashboard/elections/$electionId"
                  params={{ electionId: String(race.historyId) }}
                  className="wiki-record-row block hover:text-primary"
                >
                  <div className="flex items-center justify-between gap-3">
                    <strong>
                      {formatElectionTitle(race.election, race.cycle)}
                    </strong>
                    {race.elected && <Badge>Elected</Badge>}
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    Place #{race.placement} · {race.points} points ·{" "}
                    {share.toFixed(1)}% · {race.firstPreferenceVotes} first
                    preferences
                  </p>
                </Link>
              );
            })}
            {!candidacies.length && (
              <WikiEmpty>No completed election appearances.</WikiEmpty>
            )}
          </div>
        </WikiSection>

        <WikiSection title="Office history" icon={Crown}>
          <div>
            {officeTerms.map((term) => (
              <Link
                key={`${term.historyId}-${term.office}`}
                to={
                  term.historyId < 0
                    ? "/dashboard/government"
                    : "/dashboard/elections/$electionId"
                }
                params={
                  term.historyId < 0
                    ? undefined
                    : { electionId: String(term.historyId) }
                }
                className="wiki-record-row flex items-center justify-between gap-3 hover:text-primary"
              >
                <span>
                  <strong>{term.office}</strong>
                  <span className="block font-mono text-xs text-muted-foreground">
                    {formatWikiDate(term.startAt)} -{" "}
                    {term.endAt ? formatWikiDate(term.endAt) : "Current"}
                  </span>
                </span>
                <Badge variant="outline">{term.selection}</Badge>
              </Link>
            ))}
            {!officeTerms.length && (
              <WikiEmpty>No government service recorded yet.</WikiEmpty>
            )}
          </div>
        </WikiSection>
      </section>

      <WikiSection
        title="Party history"
        description="Certified affiliations and recorded movements, including periods as an Independent."
      >
        <div>
          {partyTerms.map((term, index) => (
            <div
              key={`${term.partyId ?? "independent"}-${String(term.startAt)}-${index}`}
              className="wiki-record-row flex flex-col justify-between gap-2 sm:flex-row sm:items-center"
            >
              {term.partyId ? (
                <Link
                  to="/dashboard/parties/$partyId"
                  params={{ partyId: String(term.partyId) }}
                  className="font-semibold hover:text-primary"
                >
                  <PartyMark name={term.partyName} color={term.partyColor} />
                </Link>
              ) : (
                <PartyMark name={null} color={null} />
              )}
              <span className="font-mono text-xs text-muted-foreground">
                {term.startAt ? formatWikiDate(term.startAt) : "Start unknown"}{" "}
                - {term.endAt ? formatWikiDate(term.endAt) : "Current"}
              </span>
            </div>
          ))}
        </div>
      </WikiSection>

      <WikiSection title="Legislative record" icon={FileText}>
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="wiki-kicker mb-2">Authored bills</h3>
            {authoredBills.map((bill) => (
              <Link
                key={bill.id}
                to="/dashboard/bills/$billId"
                params={{ billId: String(bill.id) }}
                className="wiki-record-row flex justify-between gap-3 hover:text-primary"
              >
                <span>
                  Bill #{bill.id}: {bill.title}
                </span>
                <Badge variant="outline">{bill.status}</Badge>
              </Link>
            ))}
            {!authoredBills.length && <WikiEmpty>No authored bills.</WikiEmpty>}
          </div>
          <div>
            <h3 className="wiki-kicker mb-2">Roll-call votes</h3>
            <div className="max-h-[32rem] overflow-y-auto pr-1">
              {billVotes.map((vote) => (
                <Link
                  key={`${vote.chamber}-${vote.voteId}`}
                  to="/dashboard/bills/$billId"
                  params={{ billId: String(vote.billId) }}
                  className="wiki-record-row flex items-center justify-between gap-3 hover:text-primary"
                >
                  <span className="min-w-0 truncate">
                    Bill #{vote.billId}: {vote.billTitle}
                  </span>
                  <Badge variant={vote.voteYes ? "default" : "destructive"}>
                    {vote.voteYes ? "For" : "Against"}
                  </Badge>
                </Link>
              ))}
              {!billVotes.length && <WikiEmpty>No roll-call votes.</WikiEmpty>}
            </div>
          </div>
        </div>
      </WikiSection>
    </WikiPage>
  );
}
