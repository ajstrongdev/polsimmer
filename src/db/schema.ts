import {
  bigint,
  bigserial,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { AvatarConfig } from "@/lib/avatar";

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  username: varchar("username", { length: 255 }).notNull().unique(),
  bio: text("bio"),
  pronouns: varchar("pronouns", { length: 80 }),
  photoUrl: text("photo_url"),
  avatarConfig: jsonb("avatar_config").$type<AvatarConfig | null>(),
  politicalLeaning: varchar("political_leaning", { length: 50 }),
  role: varchar("role", { length: 50 }).default("Representative"),
  partyId: integer("party_id"),
  createdAt: timestamp("created_at").defaultNow(),
  isActive: boolean("is_active").default(true),
  lastActivity: bigint("last_activity", { mode: "number" }).default(0),
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
  archivedAt: timestamp("archived_at"),
  moderationRole: varchar("moderation_role", { length: 20 })
    .default("player")
    .notNull(),
  isAncestryRoot: boolean("is_ancestry_root").default(false).notNull(),
});

export const notificationPreferences = pgTable("notification_preferences", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  inAppMentions: boolean("in_app_mentions").notNull().default(true),
  pushMentions: boolean("push_mentions").notNull().default(false),
  pushNextMoves: boolean("push_next_moves").notNull().default(false),
  pushPreview: boolean("push_preview").notNull().default(false),
  quietStart: integer("quiet_start"),
  quietEnd: integer("quiet_end"),
  timeZone: text("time_zone").notNull().default("UTC"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const notificationPushSubscriptions = pgTable(
  "notification_push_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notification_push_subscriptions_user_idx").on(table.userId),
  ],
);

export const notificationOutbox = pgTable("notification_outbox", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  sourceType: text("source_type").notNull(),
  sourceId: integer("source_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  availableAt: timestamp("available_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  attempts: integer("attempts").notNull().default(0),
});

export const notificationNextMoveReceipts = pgTable(
  "notification_next_move_receipts",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actionKey: text("action_key").notNull(),
    handledAt: timestamp("handled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.actionKey] })],
);

export const colorSchemes = pgTable(
  "color_schemes",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 60 }).notNull(),
    mode: varchar("mode", { length: 5 }).notNull(),
    background: varchar("background", { length: 7 }).notNull(),
    foreground: varchar("foreground", { length: 7 }).notNull(),
    primary: varchar("primary", { length: 7 }).notNull(),
    accent: varchar("accent", { length: 7 }).notNull(),
    isPublished: boolean("is_published").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("color_schemes_owner_idx").on(table.ownerId),
    index("color_schemes_public_idx").on(table.isPublished, table.id),
    check("color_schemes_mode_valid", sql`${table.mode} in ('light', 'dark')`),
    ...[table.background, table.foreground, table.primary, table.accent].map(
      (column, colorIndex) =>
        check(
          `color_schemes_hex_${colorIndex}_valid`,
          sql`${column} ~ '^#[0-9a-fA-F]{6}$'`,
        ),
    ),
  ],
);

// Parties table
export const parties = pgTable("parties", {
  id: serial("id").primaryKey(),
  leaderId: integer("leader_id"),
  chiefWhipId: integer("chief_whip_id"),
  socialMediaOfficerId: integer("social_media_officer_id"),
  name: varchar("name", { length: 255 }).notNull().unique(),
  color: varchar("color", { length: 7 }).notNull(),
  bio: text("bio"),
  politicalLeaning: varchar("political_leaning", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
  leaning: varchar("leaning", { length: 25 }),
  logo: varchar("logo", { length: 100 }),
  discord: varchar("discord", { length: 255 }),
  archivedAt: timestamp("archived_at"),
  formerLeaderId: integer("former_leader_id").references(() => users.id, {
    onDelete: "set null",
  }),
});

// Political stances table
export const politicalStances = pgTable("political_stances", {
  id: serial("id").primaryKey(),
  issue: varchar("issue", { length: 100 }).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
});

// Party stances table
export const partyStances = pgTable("party_stances", {
  partyId: integer("party_id"),
  stanceId: integer("stance_id"),
  value: varchar("value", { length: 1024 }).notNull(),
});

// Merge request table
export const mergeRequest = pgTable("merge_request", {
  id: serial("id").primaryKey(),
  leaderId: integer("leader_id"),
  name: varchar("name", { length: 255 }).notNull(),
  color: varchar("color", { length: 7 }).notNull(),
  bio: text("bio"),
  politicalLeaning: varchar("political_leaning", { length: 50 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  leaning: varchar("leaning", { length: 25 }).notNull(),
  logo: varchar("logo", { length: 100 }),
});

// Merge request stances table
export const mergeRequestStances = pgTable("merge_request_stances", {
  id: serial("id").primaryKey(),
  mergeRequestId: integer("merge_request_id").notNull(),
  stanceId: integer("stance_id").notNull(),
  value: text("value"),
});

// Party notifications table
export const partyNotifications = pgTable(
  "party_notifications",
  {
    senderPartyId: integer("sender_party_id").notNull(),
    receiverPartyId: integer("receiver_party_id").notNull(),
    mergeRequestId: integer("merge_request_id").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    status: varchar("status", { length: 20 }).default("Pending").notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [
        table.senderPartyId,
        table.receiverPartyId,
        table.mergeRequestId,
      ],
    }),
  }),
);

// Coalitions table
export const coalitions = pgTable("coalitions", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  color: varchar("color", { length: 7 }).notNull(),
  logo: varchar("logo", { length: 255 }),
  bio: text("bio"),
  discord: varchar("discord", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  archivedAt: timestamp("archived_at"),
});

export const coalitionMembers = pgTable(
  "coalition_members",
  {
    coalitionId: integer("coalition_id")
      .notNull()
      .references(() => coalitions.id, { onDelete: "cascade" }),
    partyId: integer("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "cascade" }),
    joinDate: timestamp("join_date").defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.coalitionId, table.partyId],
    }),
    unique("coalition_members_party_id_unique").on(table.partyId),
  ],
);

export const coalitionFormerMembers = pgTable(
  "coalition_former_members",
  {
    coalitionId: integer("coalition_id")
      .notNull()
      .references(() => coalitions.id, { onDelete: "cascade" }),
    partyId: integer("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "cascade" }),
    firstJoinedAt: timestamp("first_joined_at"),
    lastLeftAt: timestamp("last_left_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.coalitionId, table.partyId] }),
    index("coalition_former_members_party_idx").on(table.partyId),
  ],
);

export const joinRequests = pgTable("join_requests", {
  id: serial("id").primaryKey(),
  partyId: integer("party_id")
    .notNull()
    .references(() => parties.id, { onDelete: "cascade" }),
  coalitionId: integer("coalition_id")
    .notNull()
    .references(() => coalitions.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 20 }).default("Pending").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Coalition proposals: member-party leaders propose actions for coalition-wide vote
export const coalitionProposals = pgTable(
  "coalition_proposals",
  {
    id: serial("id").primaryKey(),
    coalitionId: integer("coalition_id")
      .notNull()
      .references(() => coalitions.id, { onDelete: "cascade" }),
    proposerUserId: integer("proposer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    proposerPartyId: integer("proposer_party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "restrict" }),
    /** 'join_request', 'edit', 'leave' */
    proposalType: varchar("proposal_type", { length: 30 }).notNull(),
    /** For join_request: the target partyId. For edit: JSON diff. For leave: null */
    targetId: integer("target_id"),
    /** For edit: JSON with the new fields. For others: free-text reason */
    payload:
      jsonb("payload").$type<
        Record<string, string | number | boolean | null>
      >(),
    status: varchar("status", { length: 20 }).default("open").notNull(),
    votesFor: integer("votes_for").default(0).notNull(),
    votesAgainst: integer("votes_against").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (table) => [
    index("coalition_proposals_coalition_idx").on(
      table.coalitionId,
      table.status,
    ),
  ],
);

export const coalitionVotes = pgTable(
  "coalition_votes",
  {
    proposalId: integer("proposal_id")
      .notNull()
      .references(() => coalitionProposals.id, { onDelete: "cascade" }),
    voterUserId: integer("voter_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    voterPartyId: integer("voter_party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "cascade" }),
    vote: boolean("vote").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.proposalId, table.voterUserId] }),
    unique("coalition_votes_proposal_party_unique").on(
      table.proposalId,
      table.voterPartyId,
    ),
  ],
);

// Bills table
export const bills = pgTable("bills", {
  id: serial("id").primaryKey(),
  status: varchar("status", { length: 50 }).default("Committee").notNull(),
  stage: varchar("stage", { length: 50 }).default("House").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  creatorId: integer("creator_id"),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  pool: integer("pool"),
  stageStartedAt: timestamp("stage_started_at"),
  stageEndsAt: timestamp("stage_ends_at"),
  committeeClosedAt: timestamp("committee_closed_at"),
  committeeParticipantCount: integer("committee_participant_count"),
  nationEffectsAppliedAt: timestamp("nation_effects_applied_at"),
});

export const nations = pgTable("nations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  civilRights: doublePrecision("civil_rights").default(50).notNull(),
  economy: doublePrecision("economy").default(50).notNull(),
  politicalFreedoms: doublePrecision("political_freedoms")
    .default(50)
    .notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const nationStatDefinitions = pgTable("nation_stat_definitions", {
  key: varchar("key", { length: 100 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  defaultValue: doublePrecision("default_value").notNull(),
  min: doublePrecision("min").notNull(),
  max: doublePrecision("max").notNull(),
  headline: varchar("headline", { length: 50 }),
  headlineWeight: doublePrecision("headline_weight").default(0).notNull(),
  headlineDirection: varchar("headline_direction", { length: 20 }),
  flavour: boolean("flavour").default(false).notNull(),
});

export const nationStatValues = pgTable(
  "nation_stat_values",
  {
    nationId: integer("nation_id")
      .notNull()
      .references(() => nations.id, { onDelete: "cascade" }),
    statKey: varchar("stat_key", { length: 100 })
      .notNull()
      .references(() => nationStatDefinitions.key),
    value: doublePrecision("value").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.nationId, table.statKey] })],
);

export const nationPolicyDefinitions = pgTable("nation_policy_definitions", {
  key: varchar("key", { length: 100 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  type: varchar("type", { length: 20 }).notNull(),
  options: jsonb("options").$type<Array<string> | null>(),
  min: doublePrecision("min"),
  max: doublePrecision("max"),
  defaultValue: jsonb("default_value")
    .$type<boolean | number | string>()
    .notNull(),
});

export const nationPolicyValues = pgTable(
  "nation_policy_values",
  {
    nationId: integer("nation_id")
      .notNull()
      .references(() => nations.id, { onDelete: "cascade" }),
    policyKey: varchar("policy_key", { length: 100 })
      .notNull()
      .references(() => nationPolicyDefinitions.key),
    value: jsonb("value").$type<boolean | number | string>().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.nationId, table.policyKey] })],
);

export const executiveOrders = pgTable("executive_orders", {
  id: serial("id").primaryKey(),
  presidentId: integer("president_id")
    .notNull()
    .references(() => users.id),
  title: varchar("title", { length: 160 }).notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  committeeEndsAt: timestamp("committee_ends_at").notNull(),
  enactedAt: timestamp("enacted_at"),
  cancelledAt: timestamp("cancelled_at"),
});

export const executiveOrderEffects = pgTable(
  "executive_order_effects",
  {
    orderId: integer("order_id")
      .notNull()
      .references(() => executiveOrders.id, { onDelete: "cascade" }),
    statKey: varchar("stat_key", { length: 100 })
      .notNull()
      .references(() => nationStatDefinitions.key),
    effect: doublePrecision("effect").notNull(),
    assessedEffect: doublePrecision("assessed_effect"),
    appliedChange: doublePrecision("applied_change").notNull(),
  },
  (table) => [primaryKey({ columns: [table.orderId, table.statKey] })],
);

export const executiveOrderPolicyEffects = pgTable(
  "executive_order_policy_effects",
  {
    orderId: integer("order_id")
      .primaryKey()
      .references(() => executiveOrders.id, { onDelete: "cascade" }),
    policyKey: varchar("policy_key", { length: 100 })
      .notNull()
      .references(() => nationPolicyDefinitions.key),
    previousValue: jsonb("previous_value")
      .$type<boolean | number | string>()
      .notNull(),
    newValue: jsonb("new_value").$type<boolean | number | string>().notNull(),
  },
);

export const executiveOrderAssessments = pgTable(
  "executive_order_assessments",
  {
    orderId: integer("order_id")
      .notNull()
      .references(() => executiveOrders.id, { onDelete: "cascade" }),
    senatorId: integer("senator_id")
      .notNull()
      .references(() => users.id),
    effects: jsonb("effects")
      .$type<Array<{ statKey: string; effect: number }>>()
      .notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.orderId, table.senatorId] })],
);

export const committeeAssessments = pgTable(
  "committee_assessments",
  {
    id: serial("id").primaryKey(),
    billId: integer("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    senatorId: integer("senator_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("committee_assessment_bill_senator_unique").on(
      table.billId,
      table.senatorId,
    ),
  ],
);

export const committeeStatAssessments = pgTable(
  "committee_stat_assessments",
  {
    assessmentId: integer("assessment_id")
      .notNull()
      .references(() => committeeAssessments.id, { onDelete: "cascade" }),
    statKey: varchar("stat_key", { length: 100 })
      .notNull()
      .references(() => nationStatDefinitions.key),
    effect: integer("effect").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.assessmentId, table.statKey] }),
    check("committee_stat_effect_range", sql`${table.effect} between -2 and 2`),
  ],
);

export const committeePolicyAssessments = pgTable(
  "committee_policy_assessments",
  {
    assessmentId: integer("assessment_id")
      .notNull()
      .references(() => committeeAssessments.id, { onDelete: "cascade" }),
    policyKey: varchar("policy_key", { length: 100 })
      .notNull()
      .references(() => nationPolicyDefinitions.key),
    proposedValue: jsonb("proposed_value")
      .$type<boolean | number | string>()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.assessmentId, table.policyKey] })],
);

export const billLockedStatEffects = pgTable(
  "bill_locked_stat_effects",
  {
    billId: integer("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    statKey: varchar("stat_key", { length: 100 })
      .notNull()
      .references(() => nationStatDefinitions.key),
    effect: doublePrecision("effect").notNull(),
  },
  (table) => [primaryKey({ columns: [table.billId, table.statKey] })],
);

export const billLockedPolicyEffects = pgTable(
  "bill_locked_policy_effects",
  {
    billId: integer("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    policyKey: varchar("policy_key", { length: 100 })
      .notNull()
      .references(() => nationPolicyDefinitions.key),
    previousValue: jsonb("previous_value")
      .$type<boolean | number | string>()
      .notNull(),
    newValue: jsonb("new_value").$type<boolean | number | string>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.billId, table.policyKey] })],
);

export const nationChanges = pgTable(
  "nation_changes",
  {
    id: serial("id").primaryKey(),
    nationId: integer("nation_id")
      .notNull()
      .references(() => nations.id, { onDelete: "cascade" }),
    billId: integer("bill_id").references(() => bills.id),
    executiveOrderId: integer("executive_order_id").references(
      () => executiveOrders.id,
    ),
    kind: varchar("kind", { length: 20 }).notNull(),
    key: varchar("key", { length: 100 }).notNull(),
    previousValue: jsonb("previous_value")
      .$type<boolean | number | string>()
      .notNull(),
    newValue: jsonb("new_value").$type<boolean | number | string>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("nation_change_bill_kind_key_unique").on(
      table.billId,
      table.kind,
      table.key,
    ),
    index("nation_change_created_at_idx").on(table.createdAt),
  ],
);

// Bill votes house table
export const billVotesHouse = pgTable(
  "bill_votes_house",
  {
    id: serial("id").primaryKey(),
    billId: integer("bill_id"),
    voterId: integer("voter_id"),
    voteYes: boolean("vote_yes").notNull(),
  },
  (table) => [
    unique("bill_votes_house_bill_voter_unique").on(
      table.billId,
      table.voterId,
    ),
  ],
);

// Bill votes senate table
export const billVotesSenate = pgTable(
  "bill_votes_senate",
  {
    id: serial("id").primaryKey(),
    billId: integer("bill_id"),
    voterId: integer("voter_id"),
    voteYes: boolean("vote_yes").notNull(),
  },
  (table) => [
    unique("bill_votes_senate_bill_voter_unique").on(
      table.billId,
      table.voterId,
    ),
  ],
);

// Bill votes presidential table
export const billVotesPresidential = pgTable(
  "bill_votes_presidential",
  {
    id: serial("id").primaryKey(),
    billId: integer("bill_id"),
    voterId: integer("voter_id"),
    voteYes: boolean("vote_yes").notNull(),
  },
  (table) => [
    unique("bill_votes_presidential_bill_voter_unique").on(
      table.billId,
      table.voterId,
    ),
  ],
);

// Elections table
export const elections = pgTable(
  "elections",
  {
    election: varchar("election", { length: 50 }).primaryKey(),
    status: varchar("status", { length: 50 }).default("CANDIDACY").notNull(),
    seats: integer("seats"),
    cycle: integer("cycle").default(1).notNull(),
    candidacyStartsAt: timestamp("candidacy_starts_at", {
      withTimezone: true,
    }),
    candidacyEndsAt: timestamp("candidacy_ends_at", { withTimezone: true }),
    votingStartsAt: timestamp("voting_starts_at", { withTimezone: true }),
    votingEndsAt: timestamp("voting_ends_at", { withTimezone: true }),
    electionNightStartsAt: timestamp("election_night_starts_at", {
      withTimezone: true,
    }),
    electionNightEndsAt: timestamp("election_night_ends_at", {
      withTimezone: true,
    }),
    concludedAt: timestamp("concluded_at", { withTimezone: true }),
    reportingSeed: varchar("reporting_seed", { length: 100 }),
  },
  (table) => [
    check(
      "elections_status_valid",
      sql`${table.status} in ('CANDIDACY', 'VOTING', 'ELECTION_NIGHT', 'CONCLUDED')`,
    ),
  ],
);

export const electionNightUpdates = pgTable(
  "election_night_updates",
  {
    id: serial("id").primaryKey(),
    election: varchar("election", { length: 50 })
      .notNull()
      .references(() => elections.election, { onDelete: "cascade" }),
    cycle: integer("cycle").notNull(),
    sequence: integer("sequence").notNull(),
    revealAt: timestamp("reveal_at", { withTimezone: true }).notNull(),
    type: varchar("type", { length: 50 }).notNull(),
    headline: text("headline").notNull(),
    cumulativeTotals: jsonb("cumulative_totals")
      .$type<Record<string, number>>()
      .notNull(),
    totalPoints: integer("total_points").notNull(),
  },
  (table) => [
    unique("election_night_update_sequence_unique").on(
      table.election,
      table.cycle,
      table.sequence,
    ),
    index("election_night_update_reveal_idx").on(
      table.election,
      table.cycle,
      table.revealAt,
    ),
  ],
);

// Immutable election records. Names and affiliations are denormalized so the
// historical record survives profile, membership, and party changes.
export const electionHistory = pgTable(
  "election_history",
  {
    id: serial("id").primaryKey(),
    election: varchar("election", { length: 50 }).notNull(),
    cycle: integer("cycle").notNull(),
    seats: integer("seats"),
    totalBallots: integer("total_ballots").default(0).notNull(),
    totalPoints: integer("total_points").default(0).notNull(),
    concludedAt: timestamp("concluded_at").defaultNow().notNull(),
  },
  (table) => [
    unique("election_history_election_cycle_unique").on(
      table.election,
      table.cycle,
    ),
    index("election_history_concluded_at_idx").on(table.concludedAt),
  ],
);

export const electionCandidateHistory = pgTable(
  "election_candidate_history",
  {
    id: serial("id").primaryKey(),
    electionHistoryId: integer("election_history_id")
      .notNull()
      .references(() => electionHistory.id, { onDelete: "cascade" }),
    userId: integer("user_id"),
    username: varchar("username", { length: 255 }).notNull(),
    partyId: integer("party_id"),
    partyName: varchar("party_name", { length: 255 }),
    partyColor: varchar("party_color", { length: 7 }),
    points: integer("points").default(0).notNull(),
    firstPreferenceVotes: integer("first_preference_votes")
      .default(0)
      .notNull(),
    placement: integer("placement").notNull(),
    elected: boolean("elected").default(false).notNull(),
  },
  (table) => [
    unique("election_candidate_history_result_unique").on(
      table.electionHistoryId,
      table.userId,
    ),
    index("election_candidate_history_user_idx").on(table.userId),
  ],
);

export const electionOfficeholderHistory = pgTable(
  "election_officeholder_history",
  {
    id: serial("id").primaryKey(),
    electionHistoryId: integer("election_history_id")
      .notNull()
      .references(() => electionHistory.id, { onDelete: "cascade" }),
    userId: integer("user_id"),
    username: varchar("username", { length: 255 }).notNull(),
    partyId: integer("party_id"),
    partyName: varchar("party_name", { length: 255 }),
    partyColor: varchar("party_color", { length: 7 }),
    office: varchar("office", { length: 50 }).notNull(),
    selection: varchar("selection", { length: 50 }).notNull(),
  },
  (table) => [
    unique("election_officeholder_history_member_unique").on(
      table.electionHistoryId,
      table.userId,
      table.office,
    ),
    index("election_officeholder_history_user_idx").on(table.userId),
  ],
);

// Admin-directed changes to the government, separate from certified elections.
export const coupHistory = pgTable("coup_history", {
  id: serial("id").primaryKey(),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
});

export const coupOfficeholderHistory = pgTable(
  "coup_officeholder_history",
  {
    id: serial("id").primaryKey(),
    coupId: integer("coup_id")
      .notNull()
      .references(() => coupHistory.id, { onDelete: "cascade" }),
    userId: integer("user_id"),
    username: varchar("username", { length: 255 }).notNull(),
    partyId: integer("party_id"),
    partyName: varchar("party_name", { length: 255 }),
    partyColor: varchar("party_color", { length: 7 }),
    office: varchar("office", { length: 50 }).notNull(),
  },
  (table) => [index("coup_officeholder_history_coup_idx").on(table.coupId)],
);

export const coupRoleChanges = pgTable(
  "coup_role_changes",
  {
    id: serial("id").primaryKey(),
    coupId: integer("coup_id")
      .notNull()
      .references(() => coupHistory.id, { onDelete: "cascade" }),
    userId: integer("user_id"),
    username: varchar("username", { length: 255 }).notNull(),
    fromOffice: varchar("from_office", { length: 50 }),
    toOffice: varchar("to_office", { length: 50 }).notNull(),
  },
  (table) => [index("coup_role_changes_user_idx").on(table.userId)],
);

export const archivedParties = pgTable("archived_parties", {
  partyId: integer("party_id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  color: varchar("color", { length: 7 }).notNull(),
  bio: text("bio"),
  politicalLeaning: varchar("political_leaning", { length: 50 }),
  leaning: varchar("leaning", { length: 25 }),
  logo: varchar("logo", { length: 100 }),
  discord: varchar("discord", { length: 255 }),
  createdAt: timestamp("created_at"),
  archivedAt: timestamp("archived_at").defaultNow().notNull(),
});

export const partyMembershipEvents = pgTable(
  "party_membership_events",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id"),
    username: varchar("username", { length: 255 }).notNull(),
    office: varchar("office", { length: 50 }).notNull(),
    fromPartyId: integer("from_party_id"),
    fromPartyName: varchar("from_party_name", { length: 255 }),
    fromPartyColor: varchar("from_party_color", { length: 7 }),
    toPartyId: integer("to_party_id"),
    toPartyName: varchar("to_party_name", { length: 255 }),
    toPartyColor: varchar("to_party_color", { length: 7 }),
    occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  },
  (table) => [
    index("party_membership_events_user_idx").on(table.userId),
    index("party_membership_events_from_party_idx").on(table.fromPartyId),
    index("party_membership_events_to_party_idx").on(table.toPartyId),
    index("party_membership_events_occurred_at_idx").on(table.occurredAt),
  ],
);

export const wikiArticles = pgTable(
  "wiki_articles",
  {
    id: serial("id").primaryKey(),
    entityType: varchar("entity_type", { length: 30 }).notNull(),
    entityId: varchar("entity_id", { length: 100 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("wiki_articles_entity_unique").on(table.entityType, table.entityId),
  ],
);

export const wikiArticleRevisions = pgTable(
  "wiki_article_revisions",
  {
    id: serial("id").primaryKey(),
    articleId: integer("article_id")
      .notNull()
      .references(() => wikiArticles.id, { onDelete: "cascade" }),
    editorUserId: integer("editor_user_id"),
    editorUsername: varchar("editor_username", { length: 255 }).notNull(),
    content: text("content").notNull(),
    editSummary: varchar("edit_summary", { length: 255 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("wiki_article_revisions_article_idx").on(
      table.articleId,
      table.createdAt,
    ),
  ],
);

// Candidates table
export const candidates = pgTable(
  "candidates",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    election: varchar("election", { length: 50 }),
    votes: integer("votes").default(0),
    haswon: boolean("haswon"),
  },
  (table) => ({
    userIdElectionUnique: unique().on(table.userId, table.election),
  }),
);

// Primary candidates - players declaring in their party/coalition primary
export const primaryCandidates = pgTable(
  "primary_candidates",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    partyId: integer("party_id").notNull(),
    /** If the party is in a coalition, this is set so the whole coalition votes together */
    coalitionId: integer("coalition_id"),
    votes: integer("votes").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    userUnique: unique().on(table.userId),
  }),
);

// Primary votes - one vote per user per primary cycle
export const primaryVotes = pgTable(
  "primary_votes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    candidateId: integer("candidate_id")
      .notNull()
      .references(() => primaryCandidates.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    userUnique: unique().on(table.userId),
  }),
);

export const votes = pgTable(
  "votes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    voteType: varchar("vote_type", { length: 50 }).notNull(),
    candidateId: integer("candidate_id")
      .notNull()
      .references(() => candidates.id, { onDelete: "restrict" }),
    rank: integer("rank").notNull(),
    points: integer("points").notNull(),
  },
  (table) => ({
    voterCandidateUnique: unique().on(
      table.userId,
      table.voteType,
      table.candidateId,
    ),
    voterRankUnique: unique().on(table.userId, table.voteType, table.rank),
    rankPositive: check("votes_rank_positive", sql`${table.rank} > 0`),
    pointsPositive: check("votes_points_positive", sql`${table.points} > 0`),
  }),
);

// Chats table
export const chats = pgTable("chats", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  room: varchar("room", { length: 255 }).notNull(),
  username: varchar("username", { length: 255 }).notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Feed table
export const feed = pgTable(
  "feed",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id"),
    content: text("content").notNull(),
    /** 'admin' for privileged/system actions, 'player' for normal player actions */
    visibility: varchar("visibility", { length: 10 })
      .default("player")
      .notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("feed_visibility_created_idx").on(table.visibility, table.createdAt),
  ],
);

export const billComments = pgTable(
  "bill_comments",
  {
    id: serial("id").primaryKey(),
    parentId: integer("parent_id").references(
      (): AnyPgColumn => billComments.id,
      {
        onDelete: "cascade",
      },
    ),
    billId: integer("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    username: varchar("username", { length: 255 }).notNull(),
    partyName: varchar("party_name", { length: 255 }),
    isPartyLeader: boolean("is_party_leader").default(false).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("bill_comments_bill_created_idx").on(table.billId, table.createdAt),
    index("bill_comments_parent_idx").on(table.parentId),
  ],
);

export const billPartyWhips = pgTable(
  "bill_party_whips",
  {
    id: serial("id").primaryKey(),
    billId: integer("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    partyId: integer("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "cascade" }),
    leaderUserId: integer("leader_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    position: varchar("position", { length: 10 }).notNull(),
    note: text("note"),
    enforcedAt: timestamp("enforced_at", { withTimezone: true }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("bill_party_whips_bill_party_unique").on(
      table.billId,
      table.partyId,
    ),
    index("bill_party_whips_bill_idx").on(table.billId),
  ],
);

export const billVoteIndications = pgTable(
  "bill_vote_indications",
  {
    billId: integer("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stage: varchar("stage", { length: 20 }).notNull(),
    voteYes: boolean("vote_yes").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.billId, table.userId, table.stage] }),
  ],
);

export const partyFormationInvites = pgTable("party_formation_invites", {
  id: serial("id").primaryKey(),
  founderId: integer("founder_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  inviteeId: integer("invitee_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  office: varchar("office", { length: 30 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  details: jsonb("details").notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const pressureGroups = pgTable(
  "pressure_groups",
  {
    id: serial("id").primaryKey(),
    founderId: integer("founder_id")
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 255 }).notNull(),
    details: jsonb("details")
      .$type<{
        party: {
          name: string;
          bio: string;
          color: string;
          logo?: string | null;
          leaning: string;
          discord?: string | null;
        };
        platform: string;
      }>()
      .notNull(),
    formedPartyId: integer("formed_party_id").references(() => parties.id),
    dormantPartyId: integer("dormant_party_id").references(() => parties.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("pressure_groups_pending_name_idx")
      .on(sql`lower(${table.name})`)
      .where(sql`${table.formedPartyId} is null`),
  ],
);

export const pressureGroupMembers = pgTable(
  "pressure_group_members",
  {
    groupId: integer("group_id")
      .notNull()
      .references(() => pressureGroups.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
      .unique("pressure_group_members_user_id_unique"),
  },
  (table) => [primaryKey({ columns: [table.groupId, table.userId] })],
);

export const partyJoinRequests = pgTable(
  "party_join_requests",
  {
    id: serial("id").primaryKey(),
    partyId: integer("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("party_join_requests_pending_idx")
      .on(table.partyId, table.userId)
      .where(sql`${table.status} = 'pending'`),
  ],
);

export const partyLeadershipBids = pgTable(
  "party_leadership_bids",
  {
    id: serial("id").primaryKey(),
    partyId: integer("party_id")
      .notNull()
      .references(() => parties.id, { onDelete: "cascade" }),
    candidateId: integer("candidate_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    threshold: integer("threshold").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("party_leadership_bids_open_idx")
      .on(table.partyId)
      .where(sql`${table.status} = 'open'`),
  ],
);

export const partyLeadershipSupport = pgTable(
  "party_leadership_support",
  {
    bidId: integer("bid_id")
      .notNull()
      .references(() => partyLeadershipBids.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.bidId, table.userId] })],
);

export const partyLeadershipEligible = pgTable(
  "party_leadership_eligible",
  {
    bidId: integer("bid_id")
      .notNull()
      .references(() => partyLeadershipBids.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.bidId, table.userId] })],
);

export const socialPosts = pgTable(
  "social_posts",
  {
    id: serial("id").primaryKey(),
    quotedPostId: integer("quoted_post_id").references(
      (): AnyPgColumn => socialPosts.id,
      { onDelete: "set null" },
    ),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    username: varchar("username", { length: 255 }).notNull(),
    accountKey: varchar("account_key", { length: 40 }),
    accountPartyId: integer("account_party_id").references(() => parties.id, {
      onDelete: "set null",
    }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("social_posts_created_idx").on(table.createdAt, table.id),
    index("social_posts_quoted_idx").on(table.quotedPostId),
  ],
);

export const socialComments = pgTable(
  "social_comments",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .notNull()
      .references(() => socialPosts.id, { onDelete: "cascade" }),
    parentId: integer("parent_id").references(
      (): AnyPgColumn => socialComments.id,
      {
        onDelete: "cascade",
      },
    ),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    username: varchar("username", { length: 255 }).notNull(),
    content: varchar("content", { length: 2_000 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("social_comments_post_idx").on(table.postId, table.createdAt),
    index("social_comments_parent_idx").on(table.parentId),
  ],
);

export const socialLikes = pgTable(
  "social_likes",
  {
    postId: integer("post_id")
      .notNull()
      .references(() => socialPosts.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.userId] }),
    index("social_likes_user_idx").on(table.userId),
  ],
);

export const socialDislikes = pgTable(
  "social_dislikes",
  {
    postId: integer("post_id")
      .notNull()
      .references(() => socialPosts.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.userId] }),
    index("social_dislikes_user_idx").on(table.userId),
  ],
);

export const socialCommentLikes = pgTable(
  "social_comment_likes",
  {
    commentId: integer("comment_id")
      .notNull()
      .references(() => socialComments.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.commentId, table.userId] }),
    index("social_comment_likes_user_idx").on(table.userId),
  ],
);

export const socialCommentDislikes = pgTable(
  "social_comment_dislikes",
  {
    commentId: integer("comment_id")
      .notNull()
      .references(() => socialComments.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.commentId, table.userId] }),
    index("social_comment_dislikes_user_idx").on(table.userId),
  ],
);

export const socialNotificationDismissals = pgTable(
  "social_notification_dismissals",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountKey: varchar("account_key", { length: 100 }).notNull(),
    sourceType: varchar("source_type", { length: 10 }).notNull(),
    sourceId: integer("source_id").notNull(),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.userId,
        table.accountKey,
        table.sourceType,
        table.sourceId,
      ],
    }),
  ],
);

export const socialReposts = pgTable(
  "social_reposts",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .notNull()
      .references(() => socialPosts.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("social_reposts_post_user_unique").on(table.postId, table.userId),
    index("social_reposts_created_idx").on(table.createdAt, table.id),
  ],
);

export const socialFollows = pgTable(
  "social_follows",
  {
    followerId: integer("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    followedId: integer("followed_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: "social_follows_follower_followed_pk",
      columns: [table.followerId, table.followedId],
    }),
    index("social_follows_followed_idx").on(table.followedId),
    check(
      "social_follows_no_self",
      sql`${table.followerId} <> ${table.followedId}`,
    ),
  ],
);

export const organizationLifecycleEvents = pgTable(
  "organization_lifecycle_events",
  {
    id: serial("id").primaryKey(),
    organizationType: varchar("organization_type", { length: 20 }).notNull(),
    organizationId: integer("organization_id").notNull(),
    organizationName: varchar("organization_name", { length: 255 }).notNull(),
    action: varchar("action", { length: 20 }).notNull(),
    actorUserId: integer("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    sponsorPartyId: integer("sponsor_party_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("organization_lifecycle_entity_idx").on(
      table.organizationType,
      table.organizationId,
      table.createdAt,
    ),
  ],
);

export const playerInvitations = pgTable(
  "player_invitations",
  {
    id: serial("id").primaryKey(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    tokenPrefix: varchar("token_prefix", { length: 12 }).notNull(),
    inviterId: integer("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    redeemedByUserId: integer("redeemed_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    redeemedAt: timestamp("redeemed_at"),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => [
    index("player_invitations_inviter_idx").on(table.inviterId),
    unique("player_invitations_redeemed_user_unique").on(
      table.redeemedByUserId,
    ),
  ],
);

export const playerReports = pgTable(
  "player_reports",
  {
    id: serial("id").primaryKey(),
    reporterId: integer("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reportedUserId: integer("reported_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 40 }).notNull(),
    details: text("details").notNull(),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
    resolvedByUserId: integer("resolved_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
  },
  (table) => [
    index("player_reports_reported_status_idx").on(
      table.reportedUserId,
      table.status,
    ),
  ],
);

export const moderationFlags = pgTable(
  "moderation_flags",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).default("open").notNull(),
    source: varchar("source", { length: 30 }).default("automatic").notNull(),
    suspicionScore: integer("suspicion_score").notNull(),
    explanation: jsonb("explanation").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
    resolvedByUserId: integer("resolved_by_user_id").references(
      () => users.id,
      { onDelete: "set null" },
    ),
  },
  (table) => [index("moderation_flags_status_idx").on(table.status)],
);

export const moderationAuditLog = pgTable(
  "moderation_audit_log",
  {
    id: serial("id").primaryKey(),
    actorUserId: integer("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    targetUserId: integer("target_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reportId: integer("report_id").references(() => playerReports.id, {
      onDelete: "set null",
    }),
    flagId: integer("flag_id").references(() => moderationFlags.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 40 }).notNull(),
    reason: text("reason").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("moderation_audit_target_idx").on(table.targetUserId)],
);

// Access tokens for user registration (single-use)
export const accessTokens = pgTable("access_tokens", {
  id: serial("id").primaryKey(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
  redeemedAt: timestamp("redeemed_at"),
});

// Game tracker table
export const gameTracker = pgTable("game_tracker", {
  id: serial("id").primaryKey(),
  billPool: integer("bill_pool").default(1).notNull(),
});

// Game settings table (key/value). Owns the game-speed mode selected in
// /admin, plus scheduler bookkeeping like the last game-advance run.
export const gameSettings = pgTable("game_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  party: one(parties, {
    fields: [users.partyId],
    references: [parties.id],
  }),
  bills: many(bills),
  candidates: many(candidates),
  chats: many(chats),
  feed: many(feed),
  billVotesHouse: many(billVotesHouse),
  billVotesSenate: many(billVotesSenate),
  billVotesPresidential: many(billVotesPresidential),
  invitationsIssued: many(playerInvitations, { relationName: "inviter" }),
  invitationRedeemed: one(playerInvitations, {
    fields: [users.id],
    references: [playerInvitations.redeemedByUserId],
    relationName: "redeemedUser",
  }),
}));

export const playerInvitationsRelations = relations(
  playerInvitations,
  ({ one }) => ({
    inviter: one(users, {
      fields: [playerInvitations.inviterId],
      references: [users.id],
      relationName: "inviter",
    }),
    redeemedUser: one(users, {
      fields: [playerInvitations.redeemedByUserId],
      references: [users.id],
      relationName: "redeemedUser",
    }),
  }),
);

export const partiesRelations = relations(parties, ({ one, many }) => ({
  leader: one(users, {
    fields: [parties.leaderId],
    references: [users.id],
  }),
  members: many(users),
  partyStances: many(partyStances),
  sentNotifications: many(partyNotifications, { relationName: "senderParty" }),
  receivedNotifications: many(partyNotifications, {
    relationName: "receiverParty",
  }),
}));

export const billsRelations = relations(bills, ({ one, many }) => ({
  creator: one(users, {
    fields: [bills.creatorId],
    references: [users.id],
  }),
  houseVotes: many(billVotesHouse),
  senateVotes: many(billVotesSenate),
  presidentialVotes: many(billVotesPresidential),
}));

export const billVotesHouseRelations = relations(billVotesHouse, ({ one }) => ({
  bill: one(bills, {
    fields: [billVotesHouse.billId],
    references: [bills.id],
  }),
  voter: one(users, {
    fields: [billVotesHouse.voterId],
    references: [users.id],
  }),
}));

export const billVotesSenateRelations = relations(
  billVotesSenate,
  ({ one }) => ({
    bill: one(bills, {
      fields: [billVotesSenate.billId],
      references: [bills.id],
    }),
    voter: one(users, {
      fields: [billVotesSenate.voterId],
      references: [users.id],
    }),
  }),
);

export const billVotesPresidentialRelations = relations(
  billVotesPresidential,
  ({ one }) => ({
    bill: one(bills, {
      fields: [billVotesPresidential.billId],
      references: [bills.id],
    }),
    voter: one(users, {
      fields: [billVotesPresidential.voterId],
      references: [users.id],
    }),
  }),
);

export const candidatesRelations = relations(candidates, ({ one }) => ({
  user: one(users, {
    fields: [candidates.userId],
    references: [users.id],
  }),
  election: one(elections, {
    fields: [candidates.election],
    references: [elections.election],
  }),
}));

export const electionsRelations = relations(elections, ({ many }) => ({
  candidates: many(candidates),
  electionNightUpdates: many(electionNightUpdates),
}));

export const electionNightUpdatesRelations = relations(
  electionNightUpdates,
  ({ one }) => ({
    election: one(elections, {
      fields: [electionNightUpdates.election],
      references: [elections.election],
    }),
  }),
);

export const electionHistoryRelations = relations(
  electionHistory,
  ({ many }) => ({
    candidates: many(electionCandidateHistory),
    officeholders: many(electionOfficeholderHistory),
  }),
);

export const electionCandidateHistoryRelations = relations(
  electionCandidateHistory,
  ({ one }) => ({
    election: one(electionHistory, {
      fields: [electionCandidateHistory.electionHistoryId],
      references: [electionHistory.id],
    }),
  }),
);

export const electionOfficeholderHistoryRelations = relations(
  electionOfficeholderHistory,
  ({ one }) => ({
    election: one(electionHistory, {
      fields: [electionOfficeholderHistory.electionHistoryId],
      references: [electionHistory.id],
    }),
  }),
);

export const wikiArticlesRelations = relations(wikiArticles, ({ many }) => ({
  revisions: many(wikiArticleRevisions),
}));

export const wikiArticleRevisionsRelations = relations(
  wikiArticleRevisions,
  ({ one }) => ({
    article: one(wikiArticles, {
      fields: [wikiArticleRevisions.articleId],
      references: [wikiArticles.id],
    }),
  }),
);

export const partyStancesRelations = relations(partyStances, ({ one }) => ({
  party: one(parties, {
    fields: [partyStances.partyId],
    references: [parties.id],
  }),
  stance: one(politicalStances, {
    fields: [partyStances.stanceId],
    references: [politicalStances.id],
  }),
}));

export const politicalStancesRelations = relations(
  politicalStances,
  ({ many }) => ({
    partyStances: many(partyStances),
    mergeRequestStances: many(mergeRequestStances),
  }),
);

export const mergeRequestRelations = relations(mergeRequest, ({ many }) => ({
  stances: many(mergeRequestStances),
  notifications: many(partyNotifications),
}));

export const mergeRequestStancesRelations = relations(
  mergeRequestStances,
  ({ one }) => ({
    mergeRequest: one(mergeRequest, {
      fields: [mergeRequestStances.mergeRequestId],
      references: [mergeRequest.id],
    }),
    stance: one(politicalStances, {
      fields: [mergeRequestStances.stanceId],
      references: [politicalStances.id],
    }),
  }),
);

export const partyNotificationsRelations = relations(
  partyNotifications,
  ({ one }) => ({
    senderParty: one(parties, {
      fields: [partyNotifications.senderPartyId],
      references: [parties.id],
      relationName: "senderParty",
    }),
    receiverParty: one(parties, {
      fields: [partyNotifications.receiverPartyId],
      references: [parties.id],
      relationName: "receiverParty",
    }),
    mergeRequest: one(mergeRequest, {
      fields: [partyNotifications.mergeRequestId],
      references: [mergeRequest.id],
    }),
  }),
);

export const chatsRelations = relations(chats, ({ one }) => ({
  user: one(users, {
    fields: [chats.userId],
    references: [users.id],
  }),
}));

export const feedRelations = relations(feed, ({ one }) => ({
  user: one(users, {
    fields: [feed.userId],
    references: [users.id],
  }),
}));

export const coalitionProposalsRelations = relations(
  coalitionProposals,
  ({ one, many }) => ({
    coalition: one(coalitions, {
      fields: [coalitionProposals.coalitionId],
      references: [coalitions.id],
    }),
    proposer: one(users, {
      fields: [coalitionProposals.proposerUserId],
      references: [users.id],
    }),
    proposerParty: one(parties, {
      fields: [coalitionProposals.proposerPartyId],
      references: [parties.id],
    }),
    votes: many(coalitionVotes),
  }),
);

export const coalitionVotesRelations = relations(coalitionVotes, ({ one }) => ({
  proposal: one(coalitionProposals, {
    fields: [coalitionVotes.proposalId],
    references: [coalitionProposals.id],
  }),
  voter: one(users, {
    fields: [coalitionVotes.voterUserId],
    references: [users.id],
  }),
  voterParty: one(parties, {
    fields: [coalitionVotes.voterPartyId],
    references: [parties.id],
  }),
}));
