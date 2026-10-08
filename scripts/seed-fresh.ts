import { loadEnvFile } from "node:process";
import pg from "pg";
import { avatarForUsername, renderAvatar } from "../src/lib/avatar";
import {
  POLICY_DEFINITIONS,
  STAT_DEFINITIONS,
  isBillMutablePolicy,
} from "../src/lib/nation/catalog";
import { calculateHeadlineIndices } from "../src/lib/nation/simulation";
import { seedAjAvatar } from "./seed-aj-avatar";

if (!process.env.DATABASE_URL) {
  loadEnvFile(process.env.COMPOSE_ENV_FILE ?? ".env");
}

const { instance } = await import("../src/lib/instance-config");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const deployedEnv = process.env.DEPLOYED_ENV;

if (!deployedEnv) {
  throw new Error("DEPLOYED_ENV must be set before seeding");
}

if (
  deployedEnv === "production" &&
  process.env.SEED_ALLOW_PRODUCTION !== "true"
) {
  throw new Error(
    "Refusing to reset production without SEED_ALLOW_PRODUCTION=true",
  );
}

type SqlValue = boolean | Date | null | number | string;
type Row = Record<string, unknown>;
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function insertRows(
  table: string,
  columns: Array<string>,
  rows: Array<Array<SqlValue>>,
  returning = false,
): Promise<Array<Row>> {
  if (!rows.length) return [];
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
    `insert into "${table}" (${quotedColumns}) values ${tuples.join(", ")} ${returning ? "returning *" : ""}`,
    values,
  );
  return result.rows as Array<Row>;
}

try {
  await client.connect();
  await client.query("begin");
  await client.query(`
    truncate table
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
      "social_notification_dismissals", "social_comment_dislikes", "social_comment_likes", "social_comments", "social_likes", "social_dislikes", "social_reposts", "social_posts",
       "bill_comments", "bill_party_whips", "bill_vote_indications", "party_formation_invites", "party_join_requests", "party_leadership_support", "party_leadership_eligible", "party_leadership_bids", "pressure_group_members", "pressure_groups",
      "moderation_audit_log", "moderation_flags", "player_reports", "player_invitations",
      "party_stances", "political_stances", "chats", "feed", "bills",
      "game_tracker", "game_settings", "elections", "users", "parties"
    restart identity cascade
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

  // Negative headline indicators are inverted, so 70 represents a score of 30.
  const statValues = new Map(
    STAT_DEFINITIONS.map((definition) => [
      definition.key,
      definition.headlineDirection === "negative" ? 70 : 30,
    ]),
  );
  const headlines = calculateHeadlineIndices(STAT_DEFINITIONS, statValues);
  const [nation] = await insertRows(
    "nations",
    ["name", "civil_rights", "economy", "political_freedoms"],
    [
      [
        instance.nationName,
        headlines.civil_rights,
        headlines.economy,
        headlines.political_freedoms,
      ],
    ],
    true,
  );
  const nationId = Number(nation.id);
  await insertRows(
    "nation_stat_values",
    ["nation_id", "stat_key", "value"],
    STAT_DEFINITIONS.map((definition) => [
      nationId,
      definition.key,
      statValues.get(definition.key) ?? 30,
    ]),
  );
  await insertRows(
    "nation_policy_values",
    ["nation_id", "policy_key", "value"],
    POLICY_DEFINITIONS.map((definition) => [
      nationId,
      definition.key,
      JSON.stringify(
        isBillMutablePolicy(definition.key) ? false : definition.defaultValue,
      ),
    ]),
  );

  const userRows = await insertRows(
    "users",
    [
      "email",
      "username",
      "role",
      "is_active",
      "last_activity",
      "moderation_role",
      "is_ancestry_root",
    ],
    [
      ["ajstrongdev@pm.me", "AJ", "Senator", true, 0, "admin", true],
      ["georgiewdavy@outlook.com", "G", "Representative", true, 0, "admin", true],
      [
        "jenewland1999@gmail.com",
        "jenewland1999",
        "President",
        true,
        0,
        "admin",
        true,
      ],
    ],
    true,
  );
  for (const player of userRows) {
    const avatar =
      player.email === "ajstrongdev@pm.me"
        ? seedAjAvatar
        : avatarForUsername(String(player.username));
    await client.query(
      "update users set avatar_config = $1::jsonb, photo_url = $2 where id = $3",
      [JSON.stringify(avatar), renderAvatar(avatar), Number(player.id)],
    );
  }
  const [provisionalGovernment] = await insertRows(
    "election_history",
    ["election", "cycle", "seats", "total_ballots", "total_points"],
    [["President", 0, 2, 0, 0]],
    true,
  );
  await insertRows(
    "election_officeholder_history",
    ["election_history_id", "user_id", "username", "office", "selection"],
    [
      [
        Number(provisionalGovernment.id),
        Number(userRows[0].id),
        "AJ",
        "Senator",
        "Appointed",
      ],
      [
        Number(provisionalGovernment.id),
        Number(userRows[1].id),
        "jenewland1999",
        "President",
        "Appointed",
      ],
    ],
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
  const now = new Date();
  const fourDaysMs = 4 * 24 * 60 * 60 * 1000;
  const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
  await insertRows(
    "elections",
    [
      "election",
      "status",
      "seats",
      "cycle",
      "candidacy_starts_at",
      "candidacy_ends_at",
    ],
    [
      ["Senate", "CANDIDACY", 9, 1, now, new Date(now.getTime() + fourDaysMs)],
      [
        "President",
        "CANDIDACY",
        1,
        1,
        now,
        new Date(now.getTime() + tenDaysMs),
      ],
    ],
  );

  const verification = await client.query<{
    bills: string;
    parties: string;
    socialPosts: string;
    activity: string;
    elections: string;
    policies: string;
    stats: string;
    users: string;
    electionHistory: string;
    officeholders: string;
    coups: string;
    coupOfficeholders: string;
    roleChanges: string;
    membershipEvents: string;
  }>(`select
    (select count(*) from users) as users,
    (select count(*) from bills) as bills,
    (select count(*) from parties) as parties,
    (select count(*) from social_posts) as "socialPosts",
    (select count(*) from feed) as activity,
    (select count(*) from elections) as elections,
    (select count(*) from nation_stat_values) as stats,
    (select count(*) from nation_policy_values) as policies,
    (select count(*) from election_history) as "electionHistory",
    (select count(*) from election_officeholder_history) as officeholders,
    (select count(*) from coup_history) as coups,
    (select count(*) from coup_officeholder_history) as "coupOfficeholders",
    (select count(*) from coup_role_changes) as "roleChanges",
    (select count(*) from party_membership_events) as "membershipEvents"`);
  const counts = verification.rows[0];
  if (
    Number(counts.users) !== 3 ||
    Number(counts.bills) !== 0 ||
    Number(counts.parties) !== 0 ||
    Number(counts.socialPosts) !== 0 ||
    Number(counts.activity) !== 0 ||
    Number(counts.elections) !== 2 ||
    Number(counts.electionHistory) !== 1 ||
    Number(counts.officeholders) !== 2 ||
    Number(counts.coups) !== 0 ||
    Number(counts.coupOfficeholders) !== 0 ||
    Number(counts.roleChanges) !== 0 ||
    Number(counts.membershipEvents) !== 0 ||
    Number(counts.stats) !== STAT_DEFINITIONS.length ||
    Number(counts.policies) !== POLICY_DEFINITIONS.length
  ) {
    throw new Error("Fresh seed verification failed");
  }

  await client.query("commit");
  console.log("Fresh database seed complete.");
  console.log(
    "Admin Firebase identities must be provisioned manually before login.",
  );
  console.log("Government: Provisional Government");
  console.log(
    "Officeholders: ajstrongdev (Senator), jenewland1999 (President)",
  );
  console.log(
    "Nation condition: 30 / 30 / 30; no bills, parties, posts, or activity",
  );
  console.log(
    "Elections: Senate (CANDIDACY, 4 days, cycle 2 weeks), President (CANDIDACY, 10 days, cycle 4 weeks)",
  );
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
