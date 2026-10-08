import { instance } from "@/lib/instance-config";
import { and, eq, gt, inArray, isNotNull, like, not, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  billPartyWhips,
  bills,
  candidates,
  coalitionMembers,
  committeeAssessments,
  elections,
  parties,
  partyFormationInvites,
  primaryCandidates,
  primaryVotes,
  users,
  votes,
} from "@/db/schema";
import { primaryNextMoves } from "@/lib/dashboard/action-eligibility";
import { canDeclareNationalCandidacy } from "@/lib/elections/dashboard-actions";
import { userEmailEquals } from "@/lib/server/auth/user-email";
import { officeVotingConfig } from "@/lib/server/dashboard/office-votes";
import { getPendingBillGuidance } from "@/lib/server/bills/pending-guidance";
import { getPartyLeaderActions } from "@/lib/server/dashboard/party-leader-actions";

export type NextMove = { key: string; title: string; url: string };

/** The same election/primary eligibility helpers and bill-vote predicates as Your next moves. */
export async function getPendingNextMoves(
  email: string,
): Promise<Array<NextMove>> {
  const [player] = await db
    .select({
      id: users.id,
      role: users.role,
      partyId: users.partyId,
      partyName: parties.name,
      partyLeaderId: parties.leaderId,
      partyChiefWhipId: parties.chiefWhipId,
      partySocialMediaOfficerId: parties.socialMediaOfficerId,
      partyArchivedAt: parties.archivedAt,
      active: users.isActive,
    })
    .from(users)
    .leftJoin(parties, eq(parties.id, users.partyId))
    .where(userEmailEquals(email))
    .limit(1);
  if (!player || !player.active) return [];

  const raceNames = ["President", "Senate"];
  const [electionRows, candidateRows, votedRows, primaryCandidateRows] =
    await Promise.all([
      db
        .select({
          election: elections.election,
          status: elections.status,
          cycle: elections.cycle,
          candidacyEndsAt: elections.candidacyEndsAt,
        })
        .from(elections)
        .where(inArray(elections.election, raceNames)),
      db
        .select({ userId: candidates.userId, election: candidates.election })
        .from(candidates)
        .innerJoin(users, eq(users.id, candidates.userId))
        .where(
          and(
            inArray(candidates.election, raceNames),
            not(like(users.username, "Banned User%")),
          ),
        ),
      db
        .select({ voteType: votes.voteType })
        .from(votes)
        .where(
          and(eq(votes.userId, player.id), inArray(votes.voteType, raceNames)),
        )
        .groupBy(votes.voteType),
      db
        .select({ id: primaryCandidates.id })
        .from(primaryCandidates)
        .where(eq(primaryCandidates.userId, player.id))
        .limit(1),
    ]);
  const races = electionRows.map((race) => ({
    ...race,
    player: {
      isCandidate: candidateRows.some(
        (candidate) =>
          candidate.election === race.election &&
          candidate.userId === player.id,
      ),
      isPrimaryCandidate: primaryCandidateRows.length > 0,
      hasVoted: votedRows.some((vote) => vote.voteType === race.election),
    },
    candidateCount: candidateRows.filter(
      (candidate) => candidate.election === race.election,
    ).length,
  }));
  const [presidential] = electionRows.filter(
    (race) => race.election === "President",
  );
  let primary: Parameters<typeof primaryNextMoves>[0] = null;
  let isCoalitionPrimary = false;
  if (player.partyId) {
    const [coalition] = await db
      .select({ coalitionId: coalitionMembers.coalitionId })
      .from(coalitionMembers)
      .where(eq(coalitionMembers.partyId, player.partyId))
      .limit(1);
    const partyIds = coalition
      ? (
          await db
            .select({ partyId: coalitionMembers.partyId })
            .from(coalitionMembers)
            .where(eq(coalitionMembers.coalitionId, coalition.coalitionId))
        ).map((member) => member.partyId)
      : [player.partyId];
    isCoalitionPrimary = Boolean(coalition);
    const [primaryCandidatesInGroup, [ballot]] = await Promise.all([
      db
        .select({ userId: primaryCandidates.userId })
        .from(primaryCandidates)
        .where(inArray(primaryCandidates.partyId, partyIds)),
      db
        .select({ id: primaryVotes.id })
        .from(primaryVotes)
        .where(eq(primaryVotes.userId, player.id))
        .limit(1),
    ]);
    primary = {
      electionStatus: presidential?.status ?? null,
      candidacyEndsAt: presidential?.candidacyEndsAt ?? null,
      isCandidate: primaryCandidatesInGroup.some(
        (candidate) => candidate.userId === player.id,
      ),
      candidates: primaryCandidatesInGroup,
      hasVoted: Boolean(ballot),
    };
  }
  const primaryActions = primaryNextMoves(primary, player, { races });
  const electionCandidacies = races.filter((race) =>
    canDeclareNationalCandidacy(race, races, player),
  );
  const electionVotes = races.filter(
    (race) =>
      race.status === "VOTING" &&
      !race.player.hasVoted &&
      race.candidateCount > 0,
  );
  const config =
    officeVotingConfig[player.role as keyof typeof officeVotingConfig];
  const [pendingBillVotes, pendingAssessments, pendingGuidance, leaderActions] =
    await Promise.all([
      config
        ? db
            .select({ id: bills.id, title: bills.title })
            .from(bills)
            .where(
              and(
                eq(bills.status, "Voting"),
                eq(bills.stage, config.stage),
                gt(bills.stageEndsAt, new Date()),
                sql`not exists (select 1 from ${config.votes} where ${config.votes.billId} = ${bills.id} and ${config.votes.voterId} = ${player.id})`,
              ),
            )
        : Promise.resolve([]),
      player.role === "Senator"
        ? db
            .select({ id: bills.id, title: bills.title })
            .from(bills)
            .where(
              and(
                eq(bills.status, "Committee"),
                gt(bills.stageEndsAt, new Date()),
                sql`not exists (select 1 from ${committeeAssessments} where ${committeeAssessments.billId} = ${bills.id} and ${committeeAssessments.senatorId} = ${player.id})`,
              ),
            )
        : Promise.resolve([]),
      getPendingBillGuidance(player),
      getPartyLeaderActions(player),
    ]);

  const primaryCycle = presidential?.cycle ?? 0;
  const formationInvites = await db
    .select({ id: partyFormationInvites.id, name: partyFormationInvites.name })
    .from(partyFormationInvites)
    .where(
      and(
        eq(partyFormationInvites.inviteeId, player.id),
        eq(partyFormationInvites.status, "pending"),
      ),
    );
  const enforcedBills =
    player.partyId && config
      ? await db
          .select({
            id: bills.id,
            title: bills.title,
            position: billPartyWhips.position,
            voteYes: config.votes.voteYes,
          })
          .from(bills)
          .innerJoin(
            billPartyWhips,
            and(
              eq(billPartyWhips.billId, bills.id),
              eq(billPartyWhips.partyId, player.partyId),
              isNotNull(billPartyWhips.enforcedAt),
            ),
          )
          .leftJoin(
            config.votes,
            and(
              eq(config.votes.billId, bills.id),
              eq(config.votes.voterId, player.id),
            ),
          )
          .where(
            and(
              eq(bills.status, "Voting"),
              eq(bills.stage, config.stage),
              gt(bills.stageEndsAt, new Date()),
            ),
          )
      : [];
  return [
    ...(player.partyId &&
    player.partySocialMediaOfficerId === player.id &&
    player.partyArchivedAt === null
      ? [
          {
            key: `party:${player.partyId}:social`,
            title: `Manage ${player.partyName}'s ${instance.branding.socialName} presence`,
            url: "/dashboard/social",
          },
        ]
      : []),
    ...leaderActions.membershipRequests.map((request) => ({
      key: `party:request:${request.id}`,
      title: "Review a party membership request",
      url: `/dashboard/parties/${player.partyId}#membership-requests`,
    })),
    ...leaderActions.vacantOffices.map((role) => ({
      key: `party:${player.partyId}:appoint:${role.office}`,
      title: `Appoint a ${role.title} for ${player.partyName}`,
      url: `/dashboard/parties/${player.partyId}#party-leadership`,
    })),
    ...enforcedBills.map((bill) => ({
      key: `bill:${bill.id}:enforced-whip`,
      title:
        bill.voteYes !== null && bill.voteYes !== (bill.position === "For")
          ? `URGENT: Your vote on ${bill.title} is against your party's enforced whip. Change it by the end of this stage or you will be ejected from the party`
          : `ENFORCED WHIP: ${bill.title} — a final vote against your party will eject you`,
      url: `/dashboard/bills/${bill.id}#your-vote`,
    })),
    ...formationInvites.map((invite) => ({
      key: `party:formation:${invite.id}`,
      title: `Respond to invitation to found ${invite.name}`,
      url: "/dashboard/parties",
    })),
    ...(!player.partyId
      ? [
          {
            key: "party:explore",
             title: `Find your place in ${instance.name}`,
            url: "/dashboard/parties",
          },
        ]
      : []),
    ...(primaryActions.stand
      ? [
          {
            key: `primary:${primaryCycle}:stand`,
            title: "Stand in your presidential primary",
            url: "/dashboard/parties/primaries",
          },
        ]
      : []),
    ...(primaryActions.withdraw
      ? [
          {
            key: `primary:${primaryCycle}:withdraw`,
            title: "Withdraw from your presidential primary",
            url: "/dashboard/parties/primaries",
          },
        ]
      : []),
    ...(primaryActions.vote
      ? [
          {
            key: `primary:${primaryCycle}:vote`,
            title: `Vote in your ${isCoalitionPrimary ? "coalition" : "party"} presidential primary`,
            url: "/dashboard/parties/primaries",
          },
        ]
      : []),
    ...electionCandidacies.map((race) => ({
      key: `election:${race.election}:${race.cycle}:stand`,
      title: `Stand in the ${race.election} election`,
      url: `/dashboard/elections/current-${race.election}`,
    })),
    ...electionVotes.map((race) => ({
      key: `election:${race.election}:${race.cycle}:vote`,
      title: `Vote in the ${race.election} election`,
      url: `/dashboard/elections/current-${race.election}`,
    })),
    ...pendingBillVotes.map((bill) => ({
      key: `bill:${bill.id}:${config.stage}:vote`,
      title: `Vote on ${bill.title}`,
      url: `/dashboard/bills/${bill.id}`,
    })),
    ...pendingAssessments.map((bill) => ({
      key: `bill:${bill.id}:assess`,
      title: `Assess ${bill.title}`,
      url: `/dashboard/bills/${bill.id}`,
    })),
    ...pendingGuidance.map((bill) => ({
      key: `bill:${bill.id}:${bill.stage}:party:${player.partyId}:guidance`,
      title: `Issue voting guidance for ${bill.title}`,
      url: `/dashboard/bills/${bill.id}#party-guidance`,
    })),
    ...leaderActions.coalitionJoinRequests.map((request) => ({
      key: `coalition:request:${request.id}:propose`,
      title: `Propose accepting ${request.partyName} into your coalition`,
      url: `/dashboard/parties/coalitions/${request.coalitionId}#requests`,
    })),
    ...leaderActions.coalitionVotes.map((proposal) => ({
      key: `coalition:${proposal.id}:vote`,
      title: `Vote on a coalition ${proposal.proposalType.replaceAll("_", " ")} proposal`,
      url: `/dashboard/parties/coalitions/${proposal.coalitionId}#proposals`,
    })),
  ];
}
