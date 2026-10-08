import { loadEnvFile } from "node:process";
import pg from "pg";
import { avatarForUsername, renderAvatar } from "../src/lib/avatar";
import {
  POLICY_DEFINITIONS,
  STAT_DEFINITIONS,
} from "../src/lib/nation/catalog";
import {
  applyDiminishingEffect,
  calculateHeadlineIndices,
} from "../src/lib/nation/simulation";
import { seedAjAvatar } from "./seed-aj-avatar";

loadEnvFile();

const { instance } = await import("../src/lib/instance-config");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}
if (
  process.env.NODE_ENV === "production" &&
  process.env.SEED_ALLOW_PRODUCTION !== "true"
) {
  throw new Error(
    "Refusing to replace production data without SEED_ALLOW_PRODUCTION=true",
  );
}

type SqlValue = boolean | Date | null | number | string;
type Row = Record<string, unknown>;
type SeedScenario =
  | "candidate-signup"
  | "committee-test"
  | "elections"
  | "elections-finished"
  | "midterms"
  | "primary-winner";

const scenarios = new Set<SeedScenario>([
  "candidate-signup",
  "committee-test",
  "elections",
  "elections-finished",
  "midterms",
  "primary-winner",
]);
const requestedScenario = process.argv[2] ?? "elections";
if (!scenarios.has(requestedScenario as SeedScenario)) {
  throw new Error(
    `Unknown seed scenario "${requestedScenario}". Expected one of: ${[...scenarios].join(", ")}`,
  );
}
const scenario = requestedScenario as SeedScenario;

type ElectionStatus = "CANDIDACY" | "CONCLUDED" | "VOTING";
type ElectionCycleStage = { status: ElectionStatus; duration: number };

const presidentialCycle: Array<ElectionCycleStage> = [
  { status: "CANDIDACY", duration: 10 },
  { status: "VOTING", duration: 10 },
  { status: "CONCLUDED", duration: 8 },
];
const senateCycle: Array<ElectionCycleStage> = [
  { status: "CANDIDACY", duration: 4 },
  { status: "VOTING", duration: 4 },
  { status: "CONCLUDED", duration: 6 },
];
const scenarioCycleDays: Record<SeedScenario, number> = {
  "candidate-signup": 0,
  "committee-test": 18,
  elections: 18,
  "elections-finished": 22,
  midterms: 20,
  "primary-winner": 3,
};

function getElectionState(
  cycle: Array<ElectionCycleStage>,
  elapsedDays: number,
) {
  const cycleDuration = cycle.reduce(
    (total, stage) => total + stage.duration,
    0,
  );
  let dayInCycle = elapsedDays % cycleDuration;

  for (const stage of cycle) {
    if (dayInCycle < stage.duration) {
      return {
        status: stage.status,
        daysLeft: stage.duration - dayInCycle,
        elapsedDays: dayInCycle,
      };
    }
    dayInCycle -= stage.duration;
  }

  throw new Error("Election cycle must contain at least one stage");
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function assertNoRows(label: string, query: string) {
  const result = await client.query(query);
  if (result.rowCount) {
    throw new Error(`Seed invariant failed: ${label}`);
  }
}

let randomState = 0x5eed1234;
function random() {
  randomState |= 0;
  randomState = (randomState + 0x6d2b79f5) | 0;
  let value = Math.imul(randomState ^ (randomState >>> 15), 1 | randomState);
  value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function pick<T>(items: Array<T>): T {
  return items[Math.floor(random() * items.length)];
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function buildRankedResult(
  candidateIds: Array<number>,
  voterIds: Array<number>,
  cycle: number,
  election: "President" | "Senate",
) {
  const totals = new Map(
    candidateIds.map((userId) => [
      userId,
      { userId, points: 0, firstPreferenceVotes: 0 },
    ]),
  );
  const rankings = voterIds.map((voterId, voterIndex) => {
    const ordered = [...candidateIds].sort((left, right) => {
      const score = (candidateId: number) =>
        Math.imul(
          voterId + cycle * 97 + (election === "President" ? 41 : 83),
          candidateId * 31 + voterIndex * 17,
        ) >>> 0;
      return score(left) - score(right) || left - right;
    });
    return ordered.map((userId, index) => {
      const rank = index + 1;
      const points = candidateIds.length - index;
      const result = totals.get(userId)!;
      result.points += points;
      if (rank === 1) result.firstPreferenceVotes += 1;
      return { voterId, userId, rank, points };
    });
  });
  const results = [...totals.values()].sort(
    (left, right) => right.points - left.points || left.userId - right.userId,
  );
  return { rankings, results };
}

function assertRankedResult(
  candidateCount: number,
  ballotCount: number,
  result: ReturnType<typeof buildRankedResult>,
) {
  const expectedPoints =
    ballotCount * ((candidateCount * (candidateCount + 1)) / 2);
  const actualPoints = result.results.reduce(
    (total, candidate) => total + candidate.points,
    0,
  );
  const firstPreferences = result.results.reduce(
    (total, candidate) => total + candidate.firstPreferenceVotes,
    0,
  );
  if (
    result.rankings.length !== ballotCount ||
    result.rankings.some((ranking) => ranking.length !== candidateCount) ||
    actualPoints !== expectedPoints ||
    firstPreferences !== ballotCount
  ) {
    throw new Error("Generated ranked election failed fixture invariants");
  }
}

function strictMajorityVotes(userIds: Array<number>, passes: boolean) {
  const yesCount = passes
    ? Math.floor(userIds.length / 2) + 1
    : Math.floor(userIds.length / 2);
  return userIds.map((userId, index) => [userId, index < yesCount]);
}

async function insertRows(
  table: string,
  columns: Array<string>,
  rows: Array<Array<SqlValue>>,
  returning = false,
): Promise<Array<Row>> {
  if (rows.length === 0) return [];
  const values: Array<SqlValue> = [];
  const tuples = rows.map((row) => {
    const placeholders = row.map((value) => {
      values.push(value);
      return `$${values.length}`;
    });
    return `(${placeholders.join(", ")})`;
  });
  const quotedColumns = columns.map((column) => `"${column}"`).join(", ");
  const result = await client.query(
    `INSERT INTO "${table}" (${quotedColumns}) VALUES ${tuples.join(", ")} ${returning ? "RETURNING *" : ""}`,
    values,
  );
  return result.rows as Array<Row>;
}

const partyDefinitions = [
  ["The liberal party of Oscana", "#F97316", "Center"],
  ["Workers Alliance", "#DC2626", "Left"],
  ["Liberty Forum", "#F59E0B", "Center Right"],
  ["Green Commonwealth", "#16A34A", "Left"],
  ["Forward Republic", "#7C3AED", "Center"],
  ["National Union", "#1E3A8A", "Right"],
  ["Social Democratic League", "#DB2777", "Center Left"],
  ["Free Citizens", "#EA580C", "Libertarian"],
  ["Community First", "#0891B2", "Center Left"],
  ["Constitution Party", "#991B1B", "Conservative"],
  ["Progress Coalition", "#4F46E5", "Progressive"],
  ["Independent Voice", "#475569", "Center"],
] as const;

const firstNames = [
  "Avery",
  "Jordan",
  "Morgan",
  "Riley",
  "Cameron",
  "Taylor",
  "Quinn",
  "Parker",
  "Casey",
  "Reese",
];
const lastNames = [
  "Adams",
  "Bennett",
  "Carter",
  "Diaz",
  "Ellis",
  "Foster",
  "Garcia",
  "Hayes",
  "Irwin",
  "Johnson",
];
const leanings = [
  "Far Left",
  "Left",
  "Center Left",
  "Center",
  "Center Right",
  "Right",
  "Far Right",
];

async function seed() {
  await client.connect();
  await client.query("BEGIN");
  try {
    // notification_outbox has no FK to social posts/comments, so CASCADE alone
    // would leave old source IDs behind when the social sequences restart.
    await client.query(`
      TRUNCATE TABLE
        "nation_changes", "bill_locked_policy_effects", "bill_locked_stat_effects",
        "committee_policy_assessments", "committee_stat_assessments", "committee_assessments",
        "nation_policy_values", "nation_stat_values", "nation_policy_definitions", "nation_stat_definitions", "nations",
        "wiki_article_revisions", "wiki_articles",
        "organization_lifecycle_events", "party_membership_events", "archived_parties",
        "election_night_updates", "election_candidate_history", "election_officeholder_history", "election_history",
        "coup_role_changes", "coup_officeholder_history", "coup_history",
        "votes", "primary_votes", "primary_candidates", "candidates",
        "bill_votes_house", "bill_votes_senate", "bill_votes_presidential",
        "party_notifications", "merge_request_stances", "merge_request",
        "join_requests", "coalition_members", "coalition_former_members", "coalitions",
        "notification_outbox", "social_notification_dismissals", "social_comment_dislikes", "social_comment_likes", "social_comments", "social_likes", "social_dislikes", "social_reposts", "social_posts",
        "moderation_audit_log", "moderation_flags", "player_reports", "player_invitations",
        "party_stances", "political_stances", "chats", "feed", "bills",
        "game_tracker", "game_settings", "elections", "users", "parties"
      RESTART IDENTITY CASCADE
    `);

    await insertRows(
      "nation_stat_definitions",
      [
        "key",
        "name",
        "category",
        "default_value",
        "min",
        "max",
        "headline",
        "headline_weight",
        "headline_direction",
        "flavour",
      ],
      STAT_DEFINITIONS.map((definition) => [
        definition.key,
        definition.name,
        definition.category,
        definition.defaultValue,
        definition.min,
        definition.max,
        definition.headline,
        definition.headlineWeight,
        definition.headlineDirection,
        definition.flavour,
      ]),
    );
    await insertRows(
      "nation_policy_definitions",
      [
        "key",
        "name",
        "category",
        "type",
        "options",
        "min",
        "max",
        "default_value",
      ],
      POLICY_DEFINITIONS.map((definition) => [
        definition.key,
        definition.name,
        definition.category,
        definition.type,
        definition.options ? JSON.stringify(definition.options) : null,
        definition.min,
        definition.max,
        JSON.stringify(definition.defaultValue),
      ]),
    );
    const initialStatValues = new Map(
      STAT_DEFINITIONS.map((definition) => [
        definition.key,
        definition.defaultValue,
      ]),
    );
    const initialHeadlines = calculateHeadlineIndices(
      STAT_DEFINITIONS,
      initialStatValues,
    );
    const [nationRow] = await insertRows(
      "nations",
      ["name", "civil_rights", "economy", "political_freedoms"],
      [
        [
          instance.nationName,
          initialHeadlines.civil_rights,
          initialHeadlines.economy,
          initialHeadlines.political_freedoms,
        ],
      ],
      true,
    );
    const nationId = Number(nationRow.id);
    await insertRows(
      "nation_stat_values",
      ["nation_id", "stat_key", "value"],
      STAT_DEFINITIONS.map((definition) => [
        nationId,
        definition.key,
        definition.defaultValue,
      ]),
    );
    await insertRows(
      "nation_policy_values",
      ["nation_id", "policy_key", "value"],
      POLICY_DEFINITIONS.map((definition) => [
        nationId,
        definition.key,
        JSON.stringify(definition.defaultValue),
      ]),
    );

    const partyRows = await insertRows(
      "parties",
      ["name", "color", "bio", "political_leaning", "leaning", "discord"],
      partyDefinitions.map(([name, color, leaning]) => [
        name,
        color,
        `${name} organizes voters around practical democratic reform.`,
        leaning,
        leaning,
        `https://discord.gg/${name.toLowerCase().replaceAll(" ", "-")}`,
      ]),
      true,
    );
    const partyIds = partyRows.map((row) => Number(row.id));
    const [archivedParty] = await insertRows(
      "archived_parties",
      [
        "party_id",
        "name",
        "color",
        "bio",
        "political_leaning",
        "leaning",
        "created_at",
        "archived_at",
      ],
      [
        [
          1000,
          "Civic Alliance",
          "#64748B",
          "A former cross-party organization focused on civic institutions.",
          "Center",
          "Center",
          daysAgo(300),
          daysAgo(45),
        ],
      ],
      true,
    );

    const generatedUsers = Array.from({ length: 50 }, (_, index) => {
      const firstName = firstNames[index % firstNames.length];
      const lastName = lastNames[Math.floor(index / firstNames.length)];
      const username = `${firstName} ${lastName}`;
      return [
        `${firstName}.${lastName}${index + 1}@example.invalid`.toLowerCase(),
        username,
        `${username} is a seeded citizen focused on public service and civic participation.`,
        pick(leanings),
        index === 0 ? "President" : index <= 9 ? "Senator" : "Representative",
        partyIds[index % partyIds.length],
        daysAgo(50 - index),
        true,
        Math.floor(random() * 24),
      ] satisfies Array<SqlValue>;
    });
    const userRows = await insertRows(
      "users",
      [
        "email",
        "username",
        "bio",
        "political_leaning",
        "role",
        "party_id",
        "created_at",
        "is_active",
        "last_activity",
        "moderation_role",
        "is_ancestry_root",
      ],
      [
        [
          "ajstrongdev@pm.me",
          "AJ",
          "Developer, civic technologist, and public servant.",
          "Center",
          "Representative",
          partyIds[0],
          daysAgo(365),
          true,
          0,
          "admin",
          true,
        ],
        ...generatedUsers.map((user) => [...user, "player", false]),
      ],
      true,
    );
    const aj = userRows[0];
    const ajId = Number(aj.id);
    const generatedUserIds = userRows.slice(1).map((row) => Number(row.id));
    const allUserIds = userRows.map((row) => Number(row.id));
    for (const player of userRows) {
      const avatar = player.email === "ajstrongdev@pm.me"
        ? seedAjAvatar
        : avatarForUsername(String(player.username));
      await client.query("UPDATE users SET avatar_config = $1::jsonb, photo_url = $2 WHERE id = $3", [
        JSON.stringify(avatar), renderAvatar(avatar), Number(player.id),
      ]);
    }

    for (let index = 0; index < partyIds.length; index += 1) {
      const leaderId = index === 0 ? ajId : generatedUserIds[index - 1];
      await client.query(`UPDATE parties SET leader_id = $1 WHERE id = $2`, [
        leaderId,
        partyIds[index],
      ]);
    }

    const socialSeedTime = new Date();
    const president = userRows[1];
    const socialPostRows = await insertRows(
        "social_posts",
        ["user_id", "username", "account_key", "account_party_id", "content", "created_at"],
        [
          [ajId, String(aj.username), null, null, "Welcome to Z.com—Oscana’s new town square. @POTRO, ready for the first debate?", socialSeedTime],
          [Number(president.id), String(president.username), "potro", null, "POTRO is online. We’re listening to citizens and party accounts alike: @AJ and @the-liberal-party-of-oscana", socialSeedTime],
          [ajId, String(aj.username), "party", partyIds[0], "The Liberal Party of Oscana account is live. Follow our platform and send your questions to @POTRO.", socialSeedTime],
        ],
        true,
      );
    const socialCommentRows = await insertRows(
      "social_comments",
      ["post_id", "user_id", "username", "content", "created_at"],
      [
        [Number(socialPostRows[0].id), Number(president.id), String(president.username), "@AJ Happy to join the conversation from the official account.", new Date(socialSeedTime.getTime() + 1_000)],
        [Number(socialPostRows[1].id), ajId, String(aj.username), "@POTRO Thanks for opening the floor. @renewal-coalition has a question too.", new Date(socialSeedTime.getTime() + 2_000)],
      ],
      true,
    );
    await insertRows(
      "social_comments",
      ["post_id", "parent_id", "user_id", "username", "content", "created_at"],
      [[Number(socialPostRows[0].id), Number(socialCommentRows[0].id), ajId, String(aj.username), "Thanks for joining, @POTRO. What should we discuss first?", new Date(socialSeedTime.getTime() + 3_000)]],
    );
    await insertRows(
      "social_comment_likes",
      ["comment_id", "user_id", "created_at"],
      [[Number(socialCommentRows[0].id), ajId, new Date(socialSeedTime.getTime() + 3_000)]],
    );
    await insertRows(
      "social_likes",
      ["post_id", "user_id", "created_at"],
      [[Number(socialPostRows[0].id), Number(president.id), socialSeedTime]],
    );
    await insertRows(
      "social_reposts",
      ["post_id", "user_id", "created_at"],
      [[Number(socialPostRows[1].id), ajId, socialSeedTime]],
    );
    await insertRows(
      "feed",
      ["user_id", "content", "created_at"],
      [
        [ajId, "@AJ posted on Z.com: Welcome to Z.com—Oscana’s new town square.", socialSeedTime],
        [Number(president.id), "POTRO posted on Z.com: We’re listening to citizens and party accounts alike.", new Date(socialSeedTime.getTime() + 1_000)],
        [ajId, "The liberal party of Oscana posted on Z.com: The party account is live.", new Date(socialSeedTime.getTime() + 2_000)],
        [Number(president.id), "commented on a Z.com post and mentioned @AJ.", new Date(socialSeedTime.getTime() + 3_000)],
        [ajId, "commented on a Z.com post and mentioned @POTRO.", new Date(socialSeedTime.getTime() + 4_000)],
      ],
    );

    const coalitionRows = await insertRows(
      "coalitions",
      ["name", "color", "bio"],
      [
        [
          "Renewal Coalition",
          "#0EA5E9",
          "A coalition for institutional renewal.",
        ],
        [
          "Prosperity Compact",
          "#F97316",
          "A coalition for broad-based prosperity.",
        ],
        [
          "Democratic Future",
          "#8B5CF6",
          "A coalition focused on democratic resilience.",
        ],
      ],
      true,
    );
    const coalitionIds = coalitionRows.map((row) => Number(row.id));
    await insertRows(
      "coalition_members",
      ["coalition_id", "party_id", "join_date"],
      coalitionIds.flatMap((coalitionId, index) => [
        [coalitionId, partyIds[index * 2], daysAgo(20 - index)],
        [coalitionId, partyIds[index * 2 + 1], daysAgo(18 - index)],
      ]),
    );
    await insertRows(
      "join_requests",
      ["party_id", "coalition_id", "status", "created_at"],
      partyIds
        .slice(6, 12)
        .map((partyId, index) => [
          partyId,
          coalitionIds[index % coalitionIds.length],
          index < 4 ? "Pending" : "Declined",
          daysAgo(3 + index),
        ]),
    );

    const isPrimaryScenario =
      scenario === "candidate-signup" || scenario === "primary-winner";
    const userById = new Map(
      userRows.map((user) => [
        Number(user.id),
        {
          username: String(user.username),
          partyId: Number(user.party_id),
          role: String(user.role),
        },
      ]),
    );
    const partyById = new Map(
      partyRows.map((party) => [
        Number(party.id),
        { name: String(party.name), color: String(party.color) },
      ]),
    );
    const roleByUser = new Map(
      [...userById].map(([userId, user]) => [userId, user.role]),
    );
    const appearances = new Map(allUserIds.map((userId) => [userId, 0]));

    const selectCandidates = (
      election: "President" | "Senate",
      count: number,
      offset: number,
      excluded = new Set<number>(),
    ) => {
      const eligible = allUserIds.filter((userId) => {
        const role = roleByUser.get(userId);
        return (
          !excluded.has(userId) &&
          (election === "President" ? role !== "Senator" : role !== "President")
        );
      });
      const selected = eligible
        .sort(
          (left, right) =>
            (appearances.get(left) ?? 0) - (appearances.get(right) ?? 0) ||
            ((allUserIds.indexOf(left) + offset) % allUserIds.length) -
              ((allUserIds.indexOf(right) + offset) % allUserIds.length),
        )
        .slice(0, count);
      for (const userId of selected) {
        appearances.set(userId, (appearances.get(userId) ?? 0) + 1);
      }
      return selected;
    };
    const presidentialNominationGroups = [
      [partyIds[0], partyIds[1]],
      [partyIds[2], partyIds[3]],
      [partyIds[4], partyIds[5]],
      [partyIds[6]],
      [partyIds[7]],
      [partyIds[8]],
      [partyIds[9]],
      [partyIds[10]],
      [partyIds[11]],
    ];
    const selectPresidentialCandidates = (offset: number) =>
      presidentialNominationGroups.map((partyGroup, groupIndex) => {
        const [selected] = allUserIds
          .filter((userId) => {
            const user = userById.get(userId)!;
            return (
              roleByUser.get(userId) !== "Senator" &&
              partyGroup.includes(user.partyId)
            );
          })
          .sort(
            (left, right) =>
              (appearances.get(left) ?? 0) - (appearances.get(right) ?? 0) ||
              ((allUserIds.indexOf(left) + offset + groupIndex) %
                allUserIds.length) -
                ((allUserIds.indexOf(right) + offset + groupIndex) %
                  allUserIds.length),
          );
        if (!selected) throw new Error("No eligible presidential nominee");
        appearances.set(selected, (appearances.get(selected) ?? 0) + 1);
        return selected;
      });

    const archiveFixtureElection = async ({
      election,
      cycle,
      candidateIds,
      seats,
      concludedAt,
      rankedResult,
    }: {
      election: "President" | "Senate";
      cycle: number;
      candidateIds: Array<number>;
      seats: number;
      concludedAt: Date;
      rankedResult?: ReturnType<typeof buildRankedResult>;
    }) => {
      const result =
        rankedResult ??
        buildRankedResult(candidateIds, allUserIds, cycle, election);
      assertRankedResult(candidateIds.length, allUserIds.length, result);
      const winnerIds = result.results
        .slice(0, seats)
        .map((candidate) => candidate.userId);
      const electedIds = new Set(winnerIds);

      if (election === "President") {
        for (const [userId, role] of roleByUser) {
          if (role === "President") roleByUser.set(userId, "Representative");
        }
        if (winnerIds[0]) roleByUser.set(winnerIds[0], "President");
      } else {
        for (const [userId, role] of roleByUser) {
          if (role === "Senator") roleByUser.set(userId, "Representative");
        }
        for (const winnerId of winnerIds) roleByUser.set(winnerId, "Senator");
      }

      const [history] = await insertRows(
        "election_history",
        [
          "election",
          "cycle",
          "seats",
          "total_ballots",
          "total_points",
          "concluded_at",
        ],
        [
          [
            election,
            cycle,
            seats,
            allUserIds.length,
            result.results.reduce(
              (total, candidate) => total + candidate.points,
              0,
            ),
            concludedAt,
          ],
        ],
        true,
      );
      const historyId = Number(history.id);
      await insertRows(
        "election_candidate_history",
        [
          "election_history_id",
          "user_id",
          "username",
          "party_id",
          "party_name",
          "party_color",
          "points",
          "first_preference_votes",
          "placement",
          "elected",
        ],
        result.results.map((candidate, index) => {
          const user = userById.get(candidate.userId)!;
          const party = partyById.get(user.partyId)!;
          return [
            historyId,
            candidate.userId,
            user.username,
            user.partyId,
            party.name,
            party.color,
            candidate.points,
            candidate.firstPreferenceVotes,
            index + 1,
            electedIds.has(candidate.userId),
          ];
        }),
      );
      await insertRows(
        "election_officeholder_history",
        [
          "election_history_id",
          "user_id",
          "username",
          "party_id",
          "party_name",
          "party_color",
          "office",
          "selection",
        ],
        allUserIds.map((userId) => {
          const user = userById.get(userId)!;
          const party = partyById.get(user.partyId)!;
          const office = roleByUser.get(userId)!;
          return [
            historyId,
            userId,
            user.username,
            user.partyId,
            party.name,
            party.color,
            office,
            electedIds.has(userId) ? "Elected" : "Serving",
          ];
        }),
      );
      return result;
    };

    const historicalTimeline = [
      { election: "Senate" as const, cycle: 1, days: 196 },
      { election: "President" as const, cycle: 1, days: 182 },
      { election: "Senate" as const, cycle: 2, days: 168 },
      { election: "Senate" as const, cycle: 3, days: 140 },
      { election: "President" as const, cycle: 2, days: 126 },
      { election: "Senate" as const, cycle: 4, days: 112 },
      { election: "Senate" as const, cycle: 5, days: 84 },
      { election: "President" as const, cycle: 3, days: 70 },
      { election: "Senate" as const, cycle: 6, days: 56 },
    ];
    for (const [index, event] of historicalTimeline.entries()) {
      const candidateCount = event.election === "President" ? 9 : 18;
      let candidateIds =
        event.election === "President"
          ? selectPresidentialCandidates(index)
          : selectCandidates(event.election, candidateCount, index);
      if (event.election === "Senate" && event.cycle === 6) {
        candidateIds = candidateIds.filter((userId) => userId !== ajId);
        if (candidateIds.length < candidateCount) {
          const [replacement] = allUserIds.filter(
            (userId) =>
              userId !== ajId &&
              roleByUser.get(userId) !== "President" &&
              !candidateIds.includes(userId),
          );
          if (!replacement) throw new Error("No final Senate replacement");
          candidateIds.push(replacement);
        }
      }
      await archiveFixtureElection({
        ...event,
        candidateIds,
        seats: event.election === "President" ? 1 : 9,
        concludedAt: daysAgo(event.days),
      });
    }

    const missingCandidateHistory = allUserIds.filter(
      (userId) => (appearances.get(userId) ?? 0) === 0,
    );
    if (missingCandidateHistory.length) {
      throw new Error(
        `Historical fixture missed candidate coverage for users: ${missingCandidateHistory.join(", ")}`,
      );
    }

    const cycleDay = scenarioCycleDays[scenario];
    const presidentState = getElectionState(presidentialCycle, cycleDay);
    const senateState = getElectionState(senateCycle, cycleDay);
    const electionTimestamps = (
      state: ReturnType<typeof getElectionState>,
      candidacyDays: number,
      votingDays: number,
    ) => {
      const dayMs = 24 * 60 * 60 * 1000;
      const now = Date.now();
      if (state.status === "CANDIDACY") {
        return [
          new Date(now - state.elapsedDays * dayMs),
          new Date(now + state.daysLeft * dayMs),
          null,
          null,
          null,
          null,
          null,
        ];
      }
      if (state.status === "VOTING") {
        const votingStartsAt = new Date(now - state.elapsedDays * dayMs);
        return [
          new Date(votingStartsAt.getTime() - candidacyDays * dayMs),
          votingStartsAt,
          votingStartsAt,
          new Date(now + state.daysLeft * dayMs),
          null,
          null,
          null,
        ];
      }
      const concludedAt = new Date(now - state.elapsedDays * dayMs);
      const electionNightStartsAt = new Date(
        concludedAt.getTime() - 12 * 60 * 60 * 1000,
      );
      const votingStartsAt = new Date(
        electionNightStartsAt.getTime() - votingDays * dayMs,
      );
      return [
        new Date(votingStartsAt.getTime() - candidacyDays * dayMs),
        votingStartsAt,
        votingStartsAt,
        electionNightStartsAt,
        electionNightStartsAt,
        concludedAt,
        concludedAt,
      ];
    };
    const presidentTimestamps = electionTimestamps(presidentState, 10, 10);
    const senateTimestamps = electionTimestamps(senateState, 4, 4);
    await insertRows(
      "elections",
      [
        "election",
        "status",
        "seats",
        "cycle",
        "candidacy_starts_at",
        "candidacy_ends_at",
        "voting_starts_at",
        "voting_ends_at",
        "election_night_starts_at",
        "election_night_ends_at",
        "concluded_at",
      ],
      [
        ["President", presidentState.status, 1, 4, ...presidentTimestamps],
        ["Senate", senateState.status, 9, 7, ...senateTimestamps],
      ],
    );

    const presidentialUserIds = isPrimaryScenario
      ? []
      : selectPresidentialCandidates(10);
    const senateUserIds = selectCandidates(
      "Senate",
      18,
      11,
      new Set(presidentialUserIds),
    );
    const candidateRows = await insertRows(
      "candidates",
      ["user_id", "election", "votes", "haswon"],
      [
        ...presidentialUserIds.map((userId) => [userId, "President", 0, false]),
        ...senateUserIds.map((userId) => [userId, "Senate", 0, false]),
      ],
      true,
    );
    const candidateIdByUser = new Map(
      candidateRows.map((candidate) => [
        Number(candidate.user_id),
        Number(candidate.id),
      ]),
    );
    let rankedBallotRows = 0;
    for (const election of ["President", "Senate"] as const) {
      const state = election === "President" ? presidentState : senateState;
      const cycle = election === "President" ? 4 : 7;
      const candidateIds =
        election === "President" ? presidentialUserIds : senateUserIds;
      if (state.status === "CANDIDACY" || candidateIds.length === 0) continue;
      const voterIds =
        state.status === "CONCLUDED"
          ? allUserIds
          : allUserIds.filter((userId) => userId !== ajId).slice(0, 32);
      const result = buildRankedResult(candidateIds, voterIds, cycle, election);
      assertRankedResult(candidateIds.length, voterIds.length, result);
      const voteRows = result.rankings.flatMap((ranking) =>
        ranking.map((vote) => [
          vote.voterId,
          election,
          candidateIdByUser.get(vote.userId)!,
          vote.rank,
          vote.points,
        ]),
      );
      await insertRows(
        "votes",
        ["user_id", "vote_type", "candidate_id", "rank", "points"],
        voteRows,
      );
      rankedBallotRows += voteRows.length;
      for (const [index, candidate] of result.results.entries()) {
        await client.query(
          `UPDATE candidates SET votes = $1, haswon = $2 WHERE id = $3`,
          [
            candidate.points,
            state.status === "CONCLUDED" &&
              index < (election === "President" ? 1 : 9),
            candidateIdByUser.get(candidate.userId),
          ],
        );
      }
      if (state.status === "CONCLUDED") {
        await archiveFixtureElection({
          election,
          cycle,
          candidateIds,
          seats: election === "President" ? 1 : 9,
          concludedAt: daysAgo(election === "President" ? 2 : 1),
          rankedResult: result,
        });
      }
    }

    if (scenario === "committee-test" && roleByUser.get(ajId) !== "Senator") {
      const senatorToReplace = [...roleByUser].find(
        ([userId, role]) => userId !== ajId && role === "Senator",
      )?.[0];
      if (!senatorToReplace)
        throw new Error("No Senator available for test role");

      if (roleByUser.get(ajId) === "President") {
        const replacementPresident = [...roleByUser].find(
          ([userId, role]) => userId !== ajId && role === "Representative",
        )?.[0];
        if (!replacementPresident) {
          throw new Error("No Representative available for the presidency");
        }
        roleByUser.set(replacementPresident, "President");
      }

      roleByUser.set(senatorToReplace, "Representative");
      roleByUser.set(ajId, "Senator");
    }

    await client.query(`UPDATE users SET role = 'Representative'`);
    for (const [userId, role] of roleByUser) {
      if (role !== "Representative") {
        await client.query(`UPDATE users SET role = $1 WHERE id = $2`, [
          role,
          userId,
        ]);
      }
    }

    const defectorResult = await client.query<{ id: number }>(
      `SELECT id FROM users WHERE role = 'Representative' AND party_id = $1 ORDER BY id LIMIT 1`,
      [partyIds[0]],
    );
    const defectorId = defectorResult.rows[0]?.id;
    if (!defectorId)
      throw new Error("No representative available for defection");
    await client.query(`UPDATE users SET party_id = NULL WHERE id = $1`, [
      defectorId,
    ]);
    await client.query(`UPDATE users SET party_id = $1 WHERE id = $2`, [
      partyIds[1],
      defectorId,
    ]);

    let primaryCandidateCount = 0;
    if (isPrimaryScenario) {
      const primaryEntrants = [
        ...(scenario === "primary-winner"
          ? [[ajId, partyIds[0], coalitionIds[0], 7] as const]
          : []),
        [
          generatedUserIds[12],
          partyIds[0],
          coalitionIds[0],
          scenario === "primary-winner" ? 2 : 0,
        ] as const,
        [
          generatedUserIds[13],
          partyIds[1],
          coalitionIds[0],
          scenario === "primary-winner" ? 1 : 0,
        ] as const,
        [generatedUserIds[14], partyIds[2], coalitionIds[1], 0] as const,
        [generatedUserIds[15], partyIds[3], coalitionIds[1], 0] as const,
        [generatedUserIds[16], partyIds[4], coalitionIds[2], 0] as const,
        [generatedUserIds[17], partyIds[5], coalitionIds[2], 0] as const,
        ...partyIds
          .slice(6)
          .map(
            (partyId, index) =>
              [generatedUserIds[18 + index], partyId, null, 0] as const,
          ),
      ];
      const primaryCandidateRows = await insertRows(
        "primary_candidates",
        ["user_id", "party_id", "coalition_id", "votes"],
        primaryEntrants.map((entrant) => [...entrant]),
        true,
      );
      primaryCandidateCount = primaryCandidateRows.length;

      if (scenario === "primary-winner") {
        const [ajPrimary, firstOpponent, secondOpponent] = primaryCandidateRows;
        const primaryVoterIds = [
          generatedUserIds[0],
          generatedUserIds[1],
          generatedUserIds[12],
          generatedUserIds[13],
          generatedUserIds[24],
          generatedUserIds[25],
          generatedUserIds[36],
          generatedUserIds[37],
          generatedUserIds[48],
          generatedUserIds[49],
        ];
        await insertRows(
          "primary_votes",
          ["user_id", "candidate_id"],
          primaryVoterIds.map((userId, index) => [
            userId,
            Number(
              index < 7
                ? ajPrimary.id
                : index < 9
                  ? firstOpponent.id
                  : secondOpponent.id,
            ),
          ]),
        );
      }
    }
    const billRows = await insertRows(
      "bills",
      [
        "status",
        "stage",
        "title",
        "creator_id",
        "content",
        "created_at",
        "pool",
      ],
      [
        [
          "Voting",
          "House",
          "Community Broadband Act",
          generatedUserIds[12],
          "Funds open-access municipal broadband infrastructure.",
          daysAgo(2),
          1,
        ],
        [
          "Voting",
          "House",
          "Election Access Act",
          generatedUserIds[13],
          "Expands polling access and election transparency.",
          daysAgo(2),
          1,
        ],
        [
          "Voting",
          "House",
          "Public Records Modernization Act",
          generatedUserIds[14],
          "Modernizes public records systems and retention.",
          daysAgo(1),
          1,
        ],
        [
          "Voting",
          "House",
          "Clean Transit Act",
          generatedUserIds[15],
          "Supports clean and reliable public transit.",
          daysAgo(1),
          1,
        ],
        [
          "Voting",
          "Senate",
          "Civic Service Act",
          generatedUserIds[3],
          "Creates voluntary national civic service grants.",
          daysAgo(4),
          2,
        ],
        [
          "Voting",
          "Senate",
          "Regional Rail Act",
          generatedUserIds[4],
          "Coordinates interstate passenger rail investment.",
          daysAgo(3),
          2,
        ],
        [
          "Voting",
          "Senate",
          "Data Privacy Act",
          generatedUserIds[5],
          "Establishes baseline consumer data protections.",
          daysAgo(3),
          2,
        ],
        [
          "Voting",
          "Presidential",
          "Open Government Act",
          generatedUserIds[6],
          "Requires machine-readable publication of public records.",
          daysAgo(5),
          3,
        ],
        [
          "Voting",
          "Presidential",
          "Disaster Readiness Act",
          generatedUserIds[7],
          "Coordinates national disaster readiness planning.",
          daysAgo(4),
          3,
        ],
        [
          "Committee",
          "House",
          "National Cheese Investment Act",
          generatedUserIds[22],
          "Invests in agricultural production and establishes national cheese subsidies.",
          daysAgo(1),
          4,
        ],
        [
          "Committee",
          "House",
          "Small Business Filing Act",
          generatedUserIds[23],
          "Simplifies small business reporting.",
          daysAgo(1),
          4,
        ],
        [
          "Committee",
          "House",
          "Library Access Act",
          generatedUserIds[24],
          "Supports extended public library access.",
          daysAgo(1),
          4,
        ],
        [
          "Passed",
          "Presidential",
          "Water Quality Act",
          generatedUserIds[25],
          "Improves drinking water monitoring.",
          daysAgo(12),
          2,
        ],
        [
          "Defeated",
          "Senate",
          "National Advertising Act",
          generatedUserIds[26],
          "Would have created national campaign ad rules.",
          daysAgo(10),
          2,
        ],
        [
          "Passed",
          "Presidential",
          "Veterans Services Act",
          generatedUserIds[27],
          "Improves access to veterans services.",
          daysAgo(15),
          1,
        ],
      ],
      true,
    );
    const billIds = billRows.map((row) => Number(row.id));
    const currentRepresentativeIds = allUserIds.filter(
      (userId) => roleByUser.get(userId) === "Representative",
    );
    const currentSenatorIds = allUserIds.filter(
      (userId) => roleByUser.get(userId) === "Senator",
    );
    const [currentPresidentId] = allUserIds.filter(
      (userId) => roleByUser.get(userId) === "President",
    );
    if (
      currentRepresentativeIds.length !== 41 ||
      currentSenatorIds.length !== 9 ||
      !currentPresidentId
    ) {
      throw new Error("Seeded government must contain a 41/9/1 roster");
    }
    const fixtureSenatorIds = currentSenatorIds.filter(
      (userId) => scenario !== "committee-test" || userId !== ajId,
    );
    if (fixtureSenatorIds.length < 3) {
      throw new Error("Seeded Committee fixtures require three Senators");
    }

    const committeeAssessmentRows = await insertRows(
      "committee_assessments",
      ["bill_id", "senator_id", "created_at", "updated_at"],
      [
        [billIds[9], fixtureSenatorIds[0], daysAgo(0.8), daysAgo(0.8)],
        [billIds[10], fixtureSenatorIds[0], daysAgo(0.7), daysAgo(0.7)],
        [billIds[10], fixtureSenatorIds[1], daysAgo(0.6), daysAgo(0.6)],
        [billIds[10], fixtureSenatorIds[2], daysAgo(0.5), daysAgo(0.5)],
      ],
      true,
    );
    const committeeAssessmentIds = committeeAssessmentRows.map((row) =>
      Number(row.id),
    );
    await insertRows(
      "committee_stat_assessments",
      ["assessment_id", "stat_key", "effect"],
      [
        [committeeAssessmentIds[0], "cheese_production", 2],
        [committeeAssessmentIds[0], "agricultural_output", 1],
        [committeeAssessmentIds[0], "government_spending", 1],
        [committeeAssessmentIds[1], "small_business_activity", 2],
        [committeeAssessmentIds[2], "small_business_activity", 1],
        [committeeAssessmentIds[3], "small_business_activity", 2],
      ],
    );
    await insertRows(
      "committee_policy_assessments",
      ["assessment_id", "policy_key", "proposed_value"],
      [[committeeAssessmentIds[0], "cheese_subsidies", JSON.stringify(true)]],
    );

    await client.query(
      `UPDATE bills SET committee_closed_at = created_at + interval '1 day', committee_participant_count = 2 WHERE status <> 'Committee'`,
    );
    await insertRows(
      "bill_locked_stat_effects",
      ["bill_id", "stat_key", "effect"],
      [
        [billIds[0], "internet_access", 1.5],
        [billIds[0], "government_spending", 0.8],
        [billIds[6], "privacy", 1.4],
        [billIds[6], "surveillance", -0.8],
        [billIds[12], "water_quality", 1.6],
      ],
    );
    await insertRows(
      "bill_locked_policy_effects",
      ["bill_id", "policy_key", "previous_value", "new_value"],
      [
        [
          billIds[6],
          "data_protection_law",
          JSON.stringify(false),
          JSON.stringify(true),
        ],
        [
          billIds[12],
          "clean_water_standards",
          JSON.stringify(false),
          JSON.stringify(true),
        ],
      ],
    );

    const waterDefinition = STAT_DEFINITIONS.find(
      ({ key }) => key === "water_quality",
    )!;
    const oldWater = initialStatValues.get("water_quality")!;
    const newWater = applyDiminishingEffect(
      oldWater,
      1.6,
      waterDefinition.min,
      waterDefinition.max,
    );
    initialStatValues.set("water_quality", newWater);
    const appliedHeadlines = calculateHeadlineIndices(
      STAT_DEFINITIONS,
      initialStatValues,
    );
    await client.query(
      `UPDATE nation_stat_values SET value = $1 WHERE nation_id = $2 AND stat_key = 'water_quality'`,
      [newWater, nationId],
    );
    await client.query(
      `UPDATE nation_policy_values SET value = 'true'::jsonb WHERE nation_id = $1 AND policy_key = 'clean_water_standards'`,
      [nationId],
    );
    await client.query(
      `UPDATE nations SET civil_rights = $1, economy = $2, political_freedoms = $3 WHERE id = $4`,
      [
        appliedHeadlines.civil_rights,
        appliedHeadlines.economy,
        appliedHeadlines.political_freedoms,
        nationId,
      ],
    );
    await client.query(
      `UPDATE bills SET nation_effects_applied_at = created_at + interval '3 days' WHERE id = $1`,
      [billIds[12]],
    );
    await insertRows(
      "nation_changes",
      [
        "nation_id",
        "bill_id",
        "kind",
        "key",
        "previous_value",
        "new_value",
        "created_at",
      ],
      [
        [
          nationId,
          billIds[12],
          "stat",
          "water_quality",
          JSON.stringify(oldWater),
          JSON.stringify(newWater),
          daysAgo(9),
        ],
        [
          nationId,
          billIds[12],
          "policy",
          "clean_water_standards",
          JSON.stringify(false),
          JSON.stringify(true),
          daysAgo(9),
        ],
      ],
    );

    const houseVotingBillIds = billIds.slice(0, 4);
    const housePassedBillIds = [
      ...billIds.slice(4, 9),
      billIds[12],
      billIds[13],
      billIds[14],
    ];
    await insertRows(
      "bill_votes_house",
      ["bill_id", "voter_id", "vote_yes"],
      [
        ...houseVotingBillIds.flatMap((billId, billIndex) =>
          currentRepresentativeIds.map((userId, voterIndex) => [
            billId,
            userId,
            (voterIndex + billIndex) % 3 !== 0,
          ]),
        ),
        ...housePassedBillIds.flatMap((billId) =>
          strictMajorityVotes(currentRepresentativeIds, true).map(
            ([userId, voteYes]) => [billId, userId, voteYes],
          ),
        ),
      ],
    );
    await insertRows(
      "bill_votes_senate",
      ["bill_id", "voter_id", "vote_yes"],
      [
        ...billIds
          .slice(4, 7)
          .flatMap((billId, billIndex) =>
            currentSenatorIds.map((userId, voterIndex) => [
              billId,
              userId,
              (voterIndex + billIndex) % 3 !== 0,
            ]),
          ),
        ...[billIds[7], billIds[8], billIds[12], billIds[14]].flatMap(
          (billId) =>
            strictMajorityVotes(currentSenatorIds, true).map(
              ([userId, voteYes]) => [billId, userId, voteYes],
            ),
        ),
        ...strictMajorityVotes(currentSenatorIds, false).map(
          ([userId, voteYes]) => [billIds[13], userId, voteYes],
        ),
      ],
    );
    await insertRows(
      "bill_votes_presidential",
      ["bill_id", "voter_id", "vote_yes"],
      [
        ...(scenario === "elections" && currentPresidentId === ajId
          ? []
          : [[billIds[7], currentPresidentId, true]]),
        [billIds[8], currentPresidentId, false],
        [billIds[12], currentPresidentId, true],
        [billIds[14], currentPresidentId, true],
      ],
    );

    if (scenario === "committee-test") {
      await assertNoRows(
        "ajstrongdev Committee test eligibility",
        `
          SELECT u.id
          FROM users u
          WHERE u.id = ${ajId}
            AND (
              u.role <> 'Senator'
              OR u.is_active IS NOT TRUE
              OR EXISTS (
                SELECT 1
                FROM committee_assessments assessment
                JOIN bills bill ON bill.id = assessment.bill_id
                WHERE assessment.senator_id = u.id
                  AND bill.status = 'Committee'
              )
            )
        `,
      );
    } else if (scenario === "elections") {
      await assertNoRows(
        "ajstrongdev next moves",
        `
          SELECT u.id
          FROM users u
          WHERE u.id = ${ajId}
            AND (
              u.role <> 'President'
              OR EXISTS (SELECT 1 FROM votes v WHERE v.user_id = u.id)
              OR (
                SELECT count(*)
                FROM bills b
                WHERE b.status = 'Voting'
                  AND b.stage = 'Presidential'
                  AND NOT EXISTS (
                    SELECT 1
                    FROM bill_votes_presidential vote
                    WHERE vote.bill_id = b.id AND vote.voter_id = u.id
                  )
              ) <> 1
            )
        `,
      );
    }

    const historicalElections = await client.query<{
      id: number;
      election: string;
      cycle: number;
    }>(
      `SELECT id, election, cycle FROM election_history ORDER BY concluded_at`,
    );
    const articleFixtures = [
      ...userRows.map((user) => ({
        entityType: "player",
        entityId: String(user.id),
        content: `## Political career\n\n**${String(user.username)}** entered public life as a ${String(user.political_leaning).toLowerCase()} voice focused on civic participation. This seeded article can be expanded with campaign history, alliances, controversies, and notable moments.\n\n### Background\n\n${String(user.bio)}`,
      })),
      ...partyRows.map((party) => ({
        entityType: "party",
        entityId: String(party.id),
        content: `## Platform\n\n**${String(party.name)}** organizes around the following statement of purpose:\n\n> ${String(party.bio)}\n\n### Governing principles\n\n- Protect individual liberty and equal access.\n- Publish measurable goals and transparent results.\n- Build durable institutions through democratic participation.`,
      })),
      {
        entityType: "party",
        entityId: String(archivedParty.party_id),
        content: `## Archived platform\n\n**${String(archivedParty.name)}** organized around civic participation, accountable government, and equal access. This platform is retained after the party's dissolution.`,
      },
      ...billRows.map((bill) => ({
        entityType: "bill",
        entityId: String(bill.id),
        content: `## Background\n\nThe **${String(bill.title)}** was introduced to address the policy area described in the official text. Debate centered on implementation, political support, and the measure's effect on the public.\n\n### Legislative history\n\nThe authoritative chamber-by-chamber roll call appears below.`,
      })),
      ...historicalElections.rows.map((election) => ({
        entityType: "election",
        entityId: String(election.id),
        content: `## Campaign\n\nThe ${election.election.toLowerCase()} election brought together candidates from across the political landscape. The certified totals below were calculated from complete ranked ballots.\n\n### Aftermath\n\nThe result shaped the balance of power reflected in the government composition history.`,
      })),
      ...(["President", "Senate"] as const).map((election) => ({
        entityType: "election",
        entityId: `current-${election}`,
        content: `## Campaign\n\nThe current ${election.toLowerCase()} election remains part of the live political record. This section can document declarations, endorsements, debates, and turning points as they occur.`,
      })),
      {
        entityType: "government",
        entityId: "overview",
        content:
          "## Constitutional structure\n\nGovernment is divided among the **House of Representatives**, the **Senate**, and the **presidency**. The timeline below preserves cumulative party and independent composition across certified elections and defections.\n\n## Reading the record\n\nEach entry gives the seat totals and their change from the preceding government. Representation remains in effect until the next recorded change.",
      },
    ];
    const articleRows = await insertRows(
      "wiki_articles",
      ["entity_type", "entity_id", "created_at", "updated_at"],
      articleFixtures.map((fixture, index) => [
        fixture.entityType,
        fixture.entityId,
        daysAgo(12 - index / 100),
        daysAgo(12 - index / 100),
      ]),
      true,
    );
    await insertRows(
      "wiki_article_revisions",
      [
        "article_id",
        "editor_user_id",
        "editor_username",
        "content",
        "edit_summary",
        "created_at",
      ],
      articleRows.map((article, index) => [
        Number(article.id),
        ajId,
        String(aj.username),
        articleFixtures[index].content,
        "Create the initial article",
        daysAgo(12 - index / 100),
      ]),
    );

    await insertRows(
      "chats",
      ["user_id", "room", "username", "message", "created_at"],
      Array.from({ length: 80 }, (_, index) => {
        const user = userRows[index % userRows.length];
        return [
          Number(user.id),
          index % 5 === 0 ? "elections" : "general",
          String(user.username),
          pick([
            "What issues matter most in this election?",
            "The latest polling is interesting.",
            "I posted a new policy proposal.",
            "Please read the bills currently up for a vote.",
            "Good debate today, everyone.",
          ]),
          daysAgo((80 - index) / 12),
        ];
      }),
    );
    await insertRows(
      "feed",
      ["user_id", "content", "created_at"],
      Array.from({ length: 60 }, (_, index) => [
        allUserIds[index % allUserIds.length],
        pick([
          "joined the public policy discussion.",
          "published a statement on election reform.",
          "attended a party town hall.",
          "commented on pending legislation.",
          "announced a new community initiative.",
        ]),
        daysAgo((60 - index) / 8),
      ]),
    );
    await insertRows("game_tracker", ["bill_pool"], [[1]]);
    await insertRows(
      "game_settings",
      ["key", "value"],
      [
        ["speed_mode", "regular"],
        ["speed_multiplier", "1"],
      ],
    );

    await assertNoRows(
      "historical election totals",
      `
        SELECT h.id
        FROM election_history h
        JOIN election_candidate_history c ON c.election_history_id = h.id
        GROUP BY h.id
        HAVING sum(c.first_preference_votes) <> h.total_ballots
          OR sum(c.points) <> h.total_points
          OR h.total_points <>
            h.total_ballots * (count(c.id) * (count(c.id) + 1) / 2)
          OR count(*) FILTER (WHERE c.elected) <>
            least(coalesce(h.seats, 1), count(c.id))
      `,
    );
    await assertNoRows(
      "complete player wiki coverage",
      `
        SELECT u.id
        FROM users u
        WHERE NOT EXISTS (
          SELECT 1 FROM election_candidate_history c WHERE c.user_id = u.id
        ) OR NOT EXISTS (
          SELECT 1 FROM election_officeholder_history o WHERE o.user_id = u.id
        ) OR NOT EXISTS (
          SELECT 1 FROM bill_votes_house v WHERE v.voter_id = u.id
          UNION ALL
          SELECT 1 FROM bill_votes_senate v WHERE v.voter_id = u.id
          UNION ALL
          SELECT 1 FROM bill_votes_presidential v WHERE v.voter_id = u.id
        )
      `,
    );
    await assertNoRows(
      "complete editable wiki article coverage",
      `
        WITH expected(entity_type, entity_id) AS (
          SELECT 'player', id::text FROM users
          UNION ALL SELECT 'party', id::text FROM parties
          UNION ALL SELECT 'party', party_id::text FROM archived_parties
          UNION ALL SELECT 'bill', id::text FROM bills
          UNION ALL SELECT 'election', id::text FROM election_history
          UNION ALL SELECT 'election', 'current-' || election FROM elections
          UNION ALL SELECT 'government', 'overview'
        )
        SELECT expected.entity_type, expected.entity_id
        FROM expected
        LEFT JOIN wiki_articles article
          ON article.entity_type = expected.entity_type
          AND article.entity_id = expected.entity_id
        WHERE article.id IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM wiki_article_revisions revision
            WHERE revision.article_id = article.id
          )
      `,
    );
    await assertNoRows(
      "bill chamber progression",
      `
        WITH roll_calls AS (
          SELECT
            b.id,
            b.status,
            b.stage,
            (SELECT count(*) FILTER (WHERE vote_yes) FROM bill_votes_house WHERE bill_id = b.id) AS house_yes,
            (SELECT count(*) FILTER (WHERE NOT vote_yes) FROM bill_votes_house WHERE bill_id = b.id) AS house_no,
            (SELECT count(*) FILTER (WHERE vote_yes) FROM bill_votes_senate WHERE bill_id = b.id) AS senate_yes,
            (SELECT count(*) FILTER (WHERE NOT vote_yes) FROM bill_votes_senate WHERE bill_id = b.id) AS senate_no,
            (SELECT count(*) FILTER (WHERE vote_yes) FROM bill_votes_presidential WHERE bill_id = b.id) AS president_yes,
            (SELECT count(*) FILTER (WHERE NOT vote_yes) FROM bill_votes_presidential WHERE bill_id = b.id) AS president_no
          FROM bills b
        )
        SELECT id
        FROM roll_calls
        WHERE (status = 'Committee' AND house_yes + house_no + senate_yes + senate_no + president_yes + president_no > 0)
          OR (stage IN ('Senate', 'Presidential') AND house_yes <= house_no)
          OR (stage = 'Presidential' AND senate_yes <= senate_no)
          OR (status = 'Passed' AND president_yes <= president_no)
          OR (status = 'Defeated' AND stage = 'House' AND house_yes > house_no)
          OR (status = 'Defeated' AND stage = 'Senate' AND senate_yes > senate_no)
          OR (status = 'Defeated' AND stage = 'Presidential' AND president_yes > president_no)
      `,
    );
    await assertNoRows(
      "valid active bill pool",
      `SELECT id FROM game_tracker WHERE bill_pool NOT BETWEEN 1 AND 3`,
    );

    await client.query("COMMIT");

    console.log(`Database seed complete: ${scenario}`);
    console.log(`Users: ${userRows.length} (50 generated + ajstrongdev)`);
    console.log(`Parties: ${partyRows.length}`);
    if (scenario === "committee-test") {
      console.log(
        "Committee test: ajstrongdev is an active Senator with unassessed Committee bills",
      );
    } else if (scenario === "elections") {
      console.log(
        `Elections: President Voting (${presidentialUserIds.length} candidates), Senate Voting (${candidateRows.length - presidentialUserIds.length} candidates)`,
      );
    } else if (isPrimaryScenario) {
      console.log(
        `Elections: President Candidate (${primaryCandidateCount} primary candidates), Senate Candidate (${candidateRows.length} candidates)`,
      );
      console.log(
        scenario === "primary-winner"
          ? "AJ: leading the Renewal Coalition primary with 7 votes"
          : "AJ: eligible to declare in the Renewal Coalition primary",
      );
    } else if (scenario === "elections-finished") {
      console.log(
        `Elections: President Concluded (1 elected), Senate Concluded (9 elected)`,
      );
    } else {
      console.log(
        `Elections: President Concluded, Senate Voting (${senateUserIds.length} candidates)`,
      );
    }
    console.log(
      `Wiki history: 9 baseline elections plus concluded current cycles`,
    );
    console.log(`Ranked ballot rows: ${rankedBallotRows}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

await seed();
