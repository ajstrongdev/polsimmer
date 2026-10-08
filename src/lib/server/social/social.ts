import { instance } from "@/lib/instance-config";
import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  bills,
  feed,
  parties,
  socialCommentDislikes,
  socialCommentLikes,
  socialComments,
  socialDislikes,
  socialFollows,
  socialLikes,
  socialPosts,
  socialReposts,
  users,
} from "@/db/schema";
import { userEmailEquals } from "@/lib/server/auth/user-email";
import { authMiddleware, requireAuthMiddleware } from "@/middleware/auth";
import { publishBillComment } from "@/lib/server/bills/publish-bill-comment";

async function getActivePlayer(email: string) {
  const [player] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(and(userEmailEquals(email), eq(users.isActive, true)))
    .limit(1);
  if (!player) throw new Error("An active player account is required");
  return player;
}

async function enforceCooldown(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: number,
  action: "post" | "comment",
) {
  const lockNamespace = action === "post" ? 73001 : 73002;
  await tx.execute(
    sql`select pg_advisory_xact_lock(${userId}, ${lockNamespace})`,
  );
  const lastAction =
    action === "post"
      ? await tx
          .select({ createdAt: socialPosts.createdAt })
          .from(socialPosts)
          .where(eq(socialPosts.userId, userId))
          .orderBy(desc(socialPosts.createdAt))
          .limit(1)
      : await tx
          .select({ createdAt: socialComments.createdAt })
          .from(socialComments)
          .where(eq(socialComments.userId, userId))
          .orderBy(desc(socialComments.createdAt))
          .limit(1);
  const createdAt = lastAction[0]?.createdAt;
  if (!createdAt) return;
  const remaining = 60_000 - (Date.now() - createdAt.getTime());
  if (remaining > 0) {
    throw new Error(
      `Please wait ${Math.ceil(remaining / 1000)} seconds before your next ${action}.`,
    );
  }
}

export const getSocialFeed = createServerFn()
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      limit: z.number().int().min(1).max(50).default(20),
      offset: z.number().int().min(0).default(0),
      account: z.enum(["all", "following", "players", "parties", "potro"]).default("all"),
      sort: z.enum(["newest", "popular", "least-popular"]).default("newest"),
      postId: z.number().int().positive().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const [viewer] = context.user?.email
      ? await db
          .select({
            id: users.id,
            username: users.username,
            photoUrl: users.photoUrl,
            bio: users.bio,
            role: users.role,
            isActive: users.isActive,
            partyId: parties.id,
            partyLeaderId: parties.leaderId,
            partySocialMediaOfficerId: parties.socialMediaOfficerId,
            partyName: parties.name,
            partyColor: parties.color,
          })
          .from(users)
          .leftJoin(
            parties,
            and(
              eq(users.partyId, parties.id),
              sql`${parties.archivedAt} IS NULL`,
            ),
          )
          .where(userEmailEquals(context.user.email))
          .limit(1)
      : [];
    const viewerId = viewer?.id ?? null;
    const result = await db.execute(sql`
      WITH timeline AS (
        SELECT
          'post'::text AS entry_type,
          post.id AS entry_id,
          post.id AS post_id,
          post.user_id AS actor_user_id,
          post.username AS actor_username,
          NULL::text AS reposter_username,
          post.created_at AS occurred_at
        FROM social_posts post
        UNION ALL
        SELECT
          'repost'::text AS entry_type,
          repost.id AS entry_id,
          repost.post_id,
          repost.user_id AS actor_user_id,
          actor.username AS actor_username,
          actor.username AS reposter_username,
          repost.created_at AS occurred_at
        FROM social_reposts repost
        JOIN users actor ON actor.id = repost.user_id
      )
      SELECT
        timeline.entry_type,
        timeline.entry_id,
        timeline.post_id,
        timeline.actor_user_id,
        timeline.actor_username,
        timeline.reposter_username,
        extract(epoch from timeline.occurred_at) * 1000 AS occurred_at_ms,
        post.user_id AS author_user_id,
        post.user_id AS publisher_user_id,
        post.username AS publisher_username,
        author.photo_url AS author_photo_url,
          CASE
            WHEN post.account_key = 'potro' THEN 'POTRO'
            WHEN post.account_key = 'party' THEN account_party.name
            ELSE post.username
          END AS author_username,
          post.account_key AS account_key,
          post.account_party_id AS account_party_id,
          account_party.name AS account_party_name,
          account_party.color AS account_party_color,
          account_party.logo AS account_party_logo,
          account_party.leader_id AS account_party_leader_id,
          author.party_id AS author_party_id,
          party.name AS author_party_name,
          party.color AS author_party_color,
          party.leader_id AS author_party_leader_id,
        post.content,
        quoted.id AS quoted_post_id,
        quoted.content AS quoted_content,
        CASE
          WHEN quoted.account_key = 'potro' THEN 'POTRO'
          WHEN quoted.account_key = 'party' THEN coalesce(quoted_party.name, quoted.username)
          ELSE quoted.username
        END AS quoted_author_username,
        quoted.account_key AS quoted_account_key,
        EXISTS (SELECT 1 FROM social_follows following WHERE following.follower_id = ${viewerId} AND following.followed_id = post.user_id) AS viewer_follows_author,
        EXISTS (SELECT 1 FROM social_follows following WHERE following.follower_id = ${viewerId} AND following.followed_id = timeline.actor_user_id) AS viewer_follows_actor,
        (SELECT count(*)::int FROM social_comments comment WHERE comment.post_id = post.id) AS comment_count,
        (ups.total - downs.total) AS score,
        ((SELECT count(*)::int FROM social_reposts shared WHERE shared.post_id = post.id) +
         (SELECT count(*)::int FROM social_posts quoted_share WHERE quoted_share.quoted_post_id = post.id)) AS repost_count,
        EXISTS (
          SELECT 1 FROM social_likes liked
          WHERE liked.post_id = post.id AND liked.user_id = ${viewerId}
        ) AS viewer_liked,
        EXISTS (
          SELECT 1 FROM social_dislikes disliked
          WHERE disliked.post_id = post.id AND disliked.user_id = ${viewerId}
        ) AS viewer_disliked,
        EXISTS (
          SELECT 1 FROM social_reposts shared
          WHERE shared.post_id = post.id AND shared.user_id = ${viewerId}
        ) AS viewer_reposted
      FROM timeline
      JOIN social_posts post ON post.id = timeline.post_id
      LEFT JOIN social_posts quoted ON quoted.id = post.quoted_post_id
      LEFT JOIN parties quoted_party ON quoted_party.id = quoted.account_party_id
      LEFT JOIN users author ON author.id = post.user_id
      LEFT JOIN parties party ON party.id = author.party_id AND party.archived_at IS NULL
      LEFT JOIN parties account_party ON account_party.id = post.account_party_id
      LEFT JOIN LATERAL (SELECT count(*)::int AS total FROM social_likes WHERE post_id = post.id) ups ON true
      LEFT JOIN LATERAL (SELECT count(*)::int AS total FROM social_dislikes WHERE post_id = post.id) downs ON true
      WHERE ${data.account === "players" ? sql`post.account_key IS NULL` : data.account === "parties" ? sql`post.account_key = 'party'` : data.account === "potro" ? sql`post.account_key = 'potro'` : sql`true`}
        AND ${data.postId ? sql`post.id = ${data.postId} AND timeline.entry_type = 'post'` : sql`true`}
        AND ${data.postId || data.account === "following" ? sql`true` : sql`timeline.entry_type = 'post'`}
        AND ${data.account === "following" ? sql`EXISTS (SELECT 1 FROM ${socialFollows} following WHERE following.follower_id = ${viewerId} AND following.followed_id = timeline.actor_user_id)` : sql`true`}
      ORDER BY ${data.sort === "popular" ? sql`(ups.total - downs.total) DESC,` : data.sort === "least-popular" ? sql`(ups.total - downs.total) ASC,` : sql``}
        timeline.occurred_at DESC, timeline.entry_type, timeline.entry_id DESC
      LIMIT ${data.limit} OFFSET ${data.offset}
    `);
    return {
      viewer,
      entries: result.rows.map((row) => ({
        entryType: String(row.entry_type) as "post" | "repost",
        entryId: Number(row.entry_id),
        postId: Number(row.post_id),
        actorUserId:
          row.actor_user_id === null ? null : Number(row.actor_user_id),
        actorUsername: String(row.actor_username),
        reposterUsername:
          row.reposter_username === null ? null : String(row.reposter_username),
        occurredAt: new Date(Number(row.occurred_at_ms)),
        authorUserId:
          row.author_user_id === null ? null : Number(row.author_user_id),
        authorUsername: String(row.author_username),
        accountKey: row.account_key === null ? null : String(row.account_key),
        accountPartyId:
          row.account_party_id === null ? null : Number(row.account_party_id),
        accountPartyName:
          row.account_party_name === null
            ? null
            : String(row.account_party_name),
        accountPartyColor:
          row.account_party_color === null
            ? null
            : String(row.account_party_color),
        accountPartyLogo:
          row.account_party_logo === null
            ? null
            : String(row.account_party_logo),
        publisherUserId:
          row.publisher_user_id === null ? null : Number(row.publisher_user_id),
        publisherUsername: String(row.publisher_username),
        authorPhotoUrl:
          row.author_photo_url === null ? null : String(row.author_photo_url),
        authorPartyId:
          row.account_key === "party"
            ? row.account_party_id === null
              ? null
              : Number(row.account_party_id)
            : row.author_party_id === null
              ? null
              : Number(row.author_party_id),
        authorPartyName:
          row.account_key === "party"
            ? row.account_party_name === null
              ? null
              : String(row.account_party_name)
            : row.author_party_name === null
              ? null
              : String(row.author_party_name),
        authorPartyColor:
          row.account_key === "party"
            ? row.account_party_color === null
              ? null
              : String(row.account_party_color)
            : row.author_party_color === null
              ? null
              : String(row.author_party_color),
        isPartyLeader:
          row.author_party_leader_id !== null &&
          Number(row.author_party_leader_id) ===
            (row.author_user_id === null ? -1 : Number(row.author_user_id)),
        content: String(row.content),
        quotedPostId: row.quoted_post_id === null ? null : Number(row.quoted_post_id),
        quotedContent: row.quoted_content === null ? null : String(row.quoted_content),
        quotedAuthorUsername: row.quoted_author_username === null ? null : String(row.quoted_author_username),
        quotedAccountKey: row.quoted_account_key === null ? null : String(row.quoted_account_key),
        commentCount: Number(row.comment_count),
        score: Number(row.score),
        repostCount: Number(row.repost_count),
        viewerLiked: Boolean(row.viewer_liked),
        viewerDisliked: Boolean(row.viewer_disliked),
        viewerReposted: Boolean(row.viewer_reposted),
        viewerFollowsAuthor: Boolean(row.viewer_follows_author),
        viewerFollowsActor: Boolean(row.viewer_follows_actor),
      })),
    };
  });

export const toggleSocialFollow = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .inputValidator(z.object({ userId: z.number().int().positive() }))
  .handler(async ({ data, context }) => {
    if (!context.user?.email) throw new Error("Authentication required");
    const viewer = await getActivePlayer(context.user.email);
    if (viewer.id === data.userId) throw new Error("You cannot follow yourself");
    const [target] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, data.userId), eq(users.isActive, true)))
      .limit(1);
    if (!target) throw new Error("This player is not available to follow");
    const [removed] = await db
      .delete(socialFollows)
      .where(and(eq(socialFollows.followerId, viewer.id), eq(socialFollows.followedId, target.id)))
      .returning({ followedId: socialFollows.followedId });
    if (removed) return { following: false };
    await db.insert(socialFollows).values({ followerId: viewer.id, followedId: target.id }).onConflictDoNothing();
    return { following: true };
  });

export const getSocialPartyPosts = createServerFn()
  .inputValidator(z.object({ partyId: z.number().int().positive() }))
  .handler(async ({ data }) =>
    db
      .select({
        id: socialPosts.id,
        content: socialPosts.content,
        createdAt: socialPosts.createdAt,
        publisherUserId: users.id,
        publisherUsername: socialPosts.username,
      })
      .from(socialPosts)
      .leftJoin(users, eq(socialPosts.userId, users.id))
      .where(
        and(
          eq(socialPosts.accountPartyId, data.partyId),
          eq(socialPosts.accountKey, "party"),
        ),
      )
      .orderBy(sql`${socialPosts.createdAt} DESC`)
      .limit(20),
  );

export const getSocialProfile = createServerFn()
  .middleware([authMiddleware])
  .inputValidator(z.object({ userId: z.number().int().positive() }))
  .handler(async ({ data, context }) => {
    const [profile] = await db
      .select({
        id: users.id,
        username: users.username,
        bio: users.bio,
        politicalLeaning: users.politicalLeaning,
        isActive: users.isActive,
        partyId: parties.id,
        partyName: parties.name,
        partyColor: parties.color,
        partyLeaderId: parties.leaderId,
        partySocialMediaOfficerId: parties.socialMediaOfficerId,
      })
      .from(users)
      .leftJoin(
        parties,
        and(eq(users.partyId, parties.id), sql`${parties.archivedAt} IS NULL`),
      )
      .where(eq(users.id, data.userId))
      .limit(1);
    if (!profile) return null;
    const [viewer] = context.user?.email
      ? await db.select({ id: users.id }).from(users).where(userEmailEquals(context.user.email)).limit(1)
      : [];
    const [follow] = viewer
      ? await db.select({ followedId: socialFollows.followedId }).from(socialFollows).where(and(eq(socialFollows.followerId, viewer.id), eq(socialFollows.followedId, profile.id))).limit(1)
      : [];
    const posts = await db
      .select({
        id: socialPosts.id,
        content: socialPosts.content,
        createdAt: socialPosts.createdAt,
      })
      .from(socialPosts)
      .where(
        and(
          eq(socialPosts.userId, data.userId),
          isNull(socialPosts.accountKey),
        ),
      )
      .orderBy(sql`${socialPosts.createdAt} DESC`)
      .limit(5);
    return {
      ...profile,
      isPartyLeader: profile.partyLeaderId === profile.id,
      viewerId: viewer?.id ?? null,
      viewerFollows: Boolean(follow),
      posts,
    };
  });

export const createSocialPost = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .inputValidator(
    z.object({
      content: z.string().trim().min(1).max(280),
      accountKey: z.enum(["player", "potro", "party"]).default("player"),
      partyId: z.number().int().positive().optional(),
      billId: z.number().int().positive().optional(),
      quotedPostId: z.number().int().positive().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    if (!context.user?.email) throw new Error("Authentication required");
    const player = await getActivePlayer(context.user.email);
    if (data.billId && data.accountKey !== "player") {
      throw new Error(
        "Bill discussions must be posted from your player account.",
      );
    }
    if (data.quotedPostId && (data.billId || data.accountKey !== "player")) {
      throw new Error("Quote posts must use your player account without a bill attachment.");
    }
    if (data.accountKey === "potro") {
      const [president] = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, player.id),
            eq(users.role, "President"),
            eq(users.isActive, true),
          ),
        )
        .limit(1);
      if (!president)
        throw new Error("Only the current President can post as POTRO.");
    }
    let accountPartyId: number | null = null;
    let partyAccountName: string | null = null;
    if (data.accountKey === "party") {
      if (!data.partyId)
        throw new Error("Choose a party account to post from.");
      const [party] = await db
        .select({ id: parties.id, name: parties.name })
        .from(parties)
        .where(
          and(
            eq(parties.id, data.partyId),
            eq(parties.socialMediaOfficerId, player.id),
            isNull(parties.archivedAt),
          ),
        )
        .limit(1);
      if (!party)
        throw new Error(
          "Only the Social Media Officer of an active party can post as that party.",
        );
      accountPartyId = party.id;
      partyAccountName = party.name;
    }
    return db.transaction(async (tx) => {
      await enforceCooldown(tx, player.id, "post");
      if (data.quotedPostId) {
        const [quoted] = await tx
          .select({ id: socialPosts.id })
          .from(socialPosts)
          .where(eq(socialPosts.id, data.quotedPostId))
          .limit(1);
        if (!quoted) throw new Error("The original post is no longer available.");
      }
      if (data.billId) {
        const [bill] = await tx
          .select({ id: bills.id })
          .from(bills)
          .where(eq(bills.id, data.billId))
          .limit(1);
        if (!bill) throw new Error("Bill not found");
        const [author] = await tx
          .select({
            partyId: users.partyId,
            partyName: parties.name,
            leaderId: parties.leaderId,
            archivedAt: parties.archivedAt,
          })
          .from(users)
          .leftJoin(parties, eq(parties.id, users.partyId))
          .where(eq(users.id, player.id))
          .limit(1);
        const { post } = await publishBillComment(tx, {
          billId: bill.id,
          content: data.content,
          author: {
            id: player.id,
            username: player.username,
            partyName: author?.partyName ?? null,
            isPartyLeader: Boolean(
              author?.partyId &&
              author.leaderId === player.id &&
              author.archivedAt === null,
            ),
          },
        });
        await tx.insert(feed).values({
          userId: player.id,
          content: `@${player.username} posted on ${instance.branding.socialName} about Bill #${bill.id}: ${data.content}`,
        });
        return post;
      }
      const [post] = await tx
        .insert(socialPosts)
        .values({
          userId: player.id,
          username: player.username,
          accountKey: data.accountKey === "player" ? null : data.accountKey,
          accountPartyId,
          quotedPostId: data.quotedPostId ?? null,
          content: data.content,
        })
        .returning({ id: socialPosts.id });
      const accountName =
        data.accountKey === "potro"
          ? "POTRO"
          : data.accountKey === "party"
            ? (partyAccountName ?? "A party")
            : `@${player.username}`;
      await tx.insert(feed).values({
        userId: player.id,
        content: data.quotedPostId
          ? `${accountName} quoted ${instance.branding.socialName} post #${data.quotedPostId}: ${data.content}`
          : `${accountName} posted on ${instance.branding.socialName}: ${data.content}`,
      });
      return post;
    });
  });

export const getSocialComments = createServerFn()
  .middleware([authMiddleware])
  .inputValidator(z.object({ postId: z.number().int().positive() }))
  .handler(async ({ data, context }) => {
    const [viewer] = context.user?.email
      ? await db
          .select({ id: users.id })
          .from(users)
          .where(userEmailEquals(context.user.email))
          .limit(1)
      : [];
    const viewerId = viewer?.id ?? null;
    return db
      .select({
        id: socialComments.id,
        parentId: socialComments.parentId,
        userId: socialComments.userId,
        username: socialComments.username,
        photoUrl: users.photoUrl,
        content: socialComments.content,
        createdAt: socialComments.createdAt,
        score: sql<number>`(select count(*)::int from ${socialCommentLikes} where ${socialCommentLikes.commentId} = ${socialComments.id}) - (select count(*)::int from ${socialCommentDislikes} where ${socialCommentDislikes.commentId} = ${socialComments.id})`,
        viewerLiked: sql<boolean>`exists (select 1 from ${socialCommentLikes} where ${socialCommentLikes.commentId} = ${socialComments.id} and ${socialCommentLikes.userId} = ${viewerId})`,
        viewerDisliked: sql<boolean>`exists (select 1 from ${socialCommentDislikes} where ${socialCommentDislikes.commentId} = ${socialComments.id} and ${socialCommentDislikes.userId} = ${viewerId})`,
      })
      .from(socialComments)
      .leftJoin(users, eq(socialComments.userId, users.id))
      .where(eq(socialComments.postId, data.postId))
      .orderBy(asc(socialComments.createdAt), asc(socialComments.id));
  });

export const addSocialComment = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .inputValidator(
    z.object({
      postId: z.number().int().positive(),
      parentId: z.number().int().positive().optional(),
      content: z.string().trim().min(1).max(2_000),
    }),
  )
  .handler(async ({ data, context }) => {
    if (!context.user?.email) throw new Error("Authentication required");
    const player = await getActivePlayer(context.user.email);
    return db.transaction(async (tx) => {
      await enforceCooldown(tx, player.id, "comment");
      if (data.parentId) {
        const [parent] = await tx
          .select({ postId: socialComments.postId })
          .from(socialComments)
          .where(eq(socialComments.id, data.parentId))
          .limit(1);
        if (!parent || parent.postId !== data.postId) {
          throw new Error("Reply must belong to this post");
        }
      }
      const [comment] = await tx
        .insert(socialComments)
        .values({
          postId: data.postId,
          parentId: data.parentId ?? null,
          userId: player.id,
          username: player.username,
          content: data.content,
        })
        .returning({ id: socialComments.id });
      await tx.insert(feed).values({
        userId: player.id,
        content: `commented on a ${instance.branding.socialName} post: ${data.content}`,
      });
      return comment;
    });
  });

export const toggleSocialVote = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .inputValidator(
    z.object({
      postId: z.number().int().positive(),
      vote: z.enum(["up", "down"]),
    }),
  )
  .handler(async ({ data, context }) => {
    if (!context.user?.email) throw new Error("Authentication required");
    const player = await getActivePlayer(context.user.email);
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(${data.postId}, ${player.id})`,
      );
      const [post] = await tx
        .select({ id: socialPosts.id })
        .from(socialPosts)
        .where(eq(socialPosts.id, data.postId))
        .limit(1);
      if (!post) throw new Error("Post not found");
      const [removedUp] = await tx
        .delete(socialLikes)
        .where(
          and(
            eq(socialLikes.postId, data.postId),
            eq(socialLikes.userId, player.id),
          ),
        )
        .returning({ postId: socialLikes.postId });
      const [removedDown] = await tx
        .delete(socialDislikes)
        .where(
          and(
            eq(socialDislikes.postId, data.postId),
            eq(socialDislikes.userId, player.id),
          ),
        )
        .returning({ postId: socialDislikes.postId });
      if (
        (data.vote === "up" && removedUp) ||
        (data.vote === "down" && removedDown)
      ) {
        await tx.insert(feed).values({
          userId: player.id,
          content: `removed their ${instance.branding.socialName} vote on post #${data.postId}`,
        });
        return { vote: null };
      }
      if (data.vote === "up") {
        await tx
          .insert(socialLikes)
          .values({ postId: data.postId, userId: player.id });
      } else {
        await tx
          .insert(socialDislikes)
          .values({ postId: data.postId, userId: player.id });
      }
      await tx.insert(feed).values({
        userId: player.id,
         content: `${data.vote === "up" ? "liked" : "disliked"} ${instance.branding.socialName} post #${data.postId}`,
      });
      return { vote: data.vote };
    });
  });

export const toggleSocialCommentVote = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .inputValidator(
    z.object({
      commentId: z.number().int().positive(),
      vote: z.enum(["up", "down"]),
    }),
  )
  .handler(async ({ data, context }) => {
    if (!context.user?.email) throw new Error("Authentication required");
    const player = await getActivePlayer(context.user.email);
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(${data.commentId}, ${player.id})`,
      );
      const [comment] = await tx
        .select({ id: socialComments.id })
        .from(socialComments)
        .where(eq(socialComments.id, data.commentId))
        .limit(1);
      if (!comment) throw new Error("Comment not found");
      const [removedUp] = await tx
        .delete(socialCommentLikes)
        .where(
          and(
            eq(socialCommentLikes.commentId, data.commentId),
            eq(socialCommentLikes.userId, player.id),
          ),
        )
        .returning({ commentId: socialCommentLikes.commentId });
      const [removedDown] = await tx
        .delete(socialCommentDislikes)
        .where(
          and(
            eq(socialCommentDislikes.commentId, data.commentId),
            eq(socialCommentDislikes.userId, player.id),
          ),
        )
        .returning({ commentId: socialCommentDislikes.commentId });
      if (
        (data.vote === "up" && removedUp) ||
        (data.vote === "down" && removedDown)
      ) {
        await tx.insert(feed).values({
          userId: player.id,
          content: `removed their ${instance.branding.socialName} vote on comment #${data.commentId}`,
        });
        return { vote: null };
      }
      if (data.vote === "up") {
        await tx
          .insert(socialCommentLikes)
          .values({ commentId: data.commentId, userId: player.id });
      } else {
        await tx
          .insert(socialCommentDislikes)
          .values({ commentId: data.commentId, userId: player.id });
      }
      await tx.insert(feed).values({
        userId: player.id,
         content: `${data.vote === "up" ? "liked" : "disliked"} ${instance.branding.socialName} comment #${data.commentId}`,
      });
      return { vote: data.vote };
    });
  });

export const toggleSocialRepost = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .inputValidator(z.object({ postId: z.number().int().positive() }))
  .handler(async ({ data, context }) => {
    if (!context.user?.email) throw new Error("Authentication required");
    const player = await getActivePlayer(context.user.email);
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(${data.postId}, ${player.id})`,
      );
      const [post] = await tx
        .select({ id: socialPosts.id })
        .from(socialPosts)
        .where(eq(socialPosts.id, data.postId))
        .limit(1);
      if (!post) throw new Error("Post not found");
      const [deleted] = await tx
        .delete(socialReposts)
        .where(
          and(
            eq(socialReposts.postId, data.postId),
            eq(socialReposts.userId, player.id),
          ),
        )
        .returning({ postId: socialReposts.postId });
      if (deleted) {
        await tx.insert(feed).values({
          userId: player.id,
          content: `removed their ${instance.branding.socialName} repost of post #${data.postId}`,
        });
        return { reposted: false };
      }
      await tx
        .insert(socialReposts)
        .values({ postId: data.postId, userId: player.id });
      await tx.insert(feed).values({
        userId: player.id,
        content: `reposted ${instance.branding.socialName} post #${data.postId}`,
      });
      return { reposted: true };
    });
  });
