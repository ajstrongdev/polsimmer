import { instance } from "@/lib/instance-config";
import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, gt, ilike, isNotNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  billComments,
  billPartyWhips,
  bills,
  feed,
  parties,
  users,
} from "@/db/schema";
import { db } from "@/db";
import { authMiddleware, requireAuthMiddleware } from "@/middleware/auth";
import { userEmailEquals } from "@/lib/server/auth/user-email";
import { publishBillComment } from "@/lib/server/bills/publish-bill-comment";
import { canGuideBill } from "@/lib/bills/pending-guidance";

export const searchDiscussionBills = createServerFn()
  .inputValidator(z.object({ query: z.string().trim().max(100) }))
  .handler(async ({ data }) => {
    const id = Number(data.query.match(/^(?:bill\s*)?#?(\d+)$/i)?.[1]);
    return db
      .select({ id: bills.id, title: bills.title, status: bills.status })
      .from(bills)
      .where(
        data.query
          ? or(
              ilike(bills.title, `%${data.query}%`),
              Number.isSafeInteger(id) && id > 0 ? eq(bills.id, id) : undefined,
            )
          : undefined,
      )
      .orderBy(sql`${bills.id} DESC`)
      .limit(12);
  });

export const getBillComments = createServerFn()
  .inputValidator(z.object({ billId: z.number().int().positive() }))
  .handler(async ({ data }) => {
    return db
      .select({
        id: billComments.id,
        parentId: billComments.parentId,
        userId: billComments.userId,
        username: billComments.username,
        photoUrl: users.photoUrl,
        partyName: billComments.partyName,
        isPartyLeader: billComments.isPartyLeader,
        content: billComments.content,
        createdAt: billComments.createdAt,
      })
      .from(billComments)
      .leftJoin(users, eq(users.id, billComments.userId))
      .where(eq(billComments.billId, data.billId))
      .orderBy(asc(billComments.createdAt), asc(billComments.id));
  });

export const addBillComment = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .inputValidator(
    z.object({
      billId: z.number().int().positive(),
      parentId: z.number().int().positive().optional(),
      content: z.string().trim().min(1).max(5_000),
    }),
  )
  .handler(async ({ data, context }) => {
    if (!context.user?.email) throw new Error("Authentication required");
    return db.transaction(async (tx) => {
      const [author] = await tx
        .select({
          id: users.id,
          username: users.username,
          isActive: users.isActive,
          partyId: users.partyId,
          partyName: parties.name,
          partyLeaderId: parties.leaderId,
          partyArchivedAt: parties.archivedAt,
        })
        .from(users)
        .leftJoin(parties, eq(parties.id, users.partyId))
        .where(userEmailEquals(context.user!.email!))
        .limit(1);
      if (!author) throw new Error("Player account not found");
      if (!author.isActive)
        throw new Error("Active players can comment on bills");
      const [bill] = await tx
        .select({ id: bills.id, title: bills.title })
        .from(bills)
        .where(eq(bills.id, data.billId))
        .limit(1);
      if (!bill) throw new Error("Bill not found");

      const { comment } = await publishBillComment(tx, {
        billId: bill.id,
        parentId: data.parentId,
        content: data.content,
        author: {
          id: author.id,
          username: author.username,
          partyName: author.partyName,
          isPartyLeader:
            !!author.partyId &&
            author.partyLeaderId === author.id &&
            author.partyArchivedAt === null,
        },
      });
      await tx.insert(feed).values({
        userId: author.id,
         content: `${data.parentId ? "replied to a discussion on" : "commented on"} Bill #${bill.id} on ${instance.branding.socialName}`,
      });
      return comment;
    });
  });

export const getBillWhips = createServerFn()
  .middleware([authMiddleware])
  .inputValidator(z.object({ billId: z.number().int().positive() }))
  .handler(async ({ data, context }) => {
    const [currentUser] = context.user?.email
      ? await db
          .select({
            id: users.id,
            partyId: users.partyId,
            isActive: users.isActive,
            leaderId: parties.leaderId,
            chiefWhipId: parties.chiefWhipId,
            archivedAt: parties.archivedAt,
          })
          .from(users)
          .leftJoin(parties, eq(parties.id, users.partyId))
          .where(userEmailEquals(context.user.email))
          .limit(1)
      : [];
    const whips = await db
      .select({
        id: billPartyWhips.id,
        partyId: billPartyWhips.partyId,
        partyName: parties.name,
        partyColor: parties.color,
        leaderUsername: users.username,
        position: billPartyWhips.position,
        note: billPartyWhips.note,
        updatedAt: billPartyWhips.updatedAt,
        enforcedAt: billPartyWhips.enforcedAt,
      })
      .from(billPartyWhips)
      .innerJoin(parties, eq(parties.id, billPartyWhips.partyId))
      .leftJoin(users, eq(users.id, billPartyWhips.leaderUserId))
      .where(eq(billPartyWhips.billId, data.billId))
      .orderBy(asc(parties.name));

    const [bill] = await db
      .select({
        status: bills.status,
        stage: bills.stage,
        stageEndsAt: bills.stageEndsAt,
      })
      .from(bills)
      .where(eq(bills.id, data.billId))
      .limit(1);
    const isChiefWhip = Boolean(
      currentUser?.isActive &&
      currentUser.partyId &&
      currentUser.chiefWhipId === currentUser.id &&
      currentUser.archivedAt === null,
    );
    return {
      whips,
      currentPartyId: currentUser?.partyId ?? null,
      isChiefWhip,
      canWhip: isChiefWhip && Boolean(bill && canGuideBill(bill)),
    };
  });

export const saveBillWhip = createServerFn({ method: "POST" })
  .middleware([requireAuthMiddleware])
  .inputValidator(
    z.object({
      billId: z.number().int().positive(),
      position: z.enum(["For", "Against"]),
      note: z.string().trim().max(1_000).optional(),
      enforce: z.boolean().default(false),
    }),
  )
  .handler(async ({ data, context }) => {
    if (!context.user?.email) throw new Error("Authentication required");
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(24092026)`);
      const [leader] = await tx
        .select({
          id: users.id,
          partyId: users.partyId,
          isActive: users.isActive,
          partyName: parties.name,
          leaderId: parties.leaderId,
          chiefWhipId: parties.chiefWhipId,
          archivedAt: parties.archivedAt,
        })
        .from(users)
        .leftJoin(parties, eq(parties.id, users.partyId))
        .where(userEmailEquals(context.user!.email!))
        .limit(1);
      if (
        !leader?.isActive ||
        !leader.partyId ||
        leader.chiefWhipId !== leader.id ||
        leader.archivedAt !== null
      ) {
        throw new Error(
          "Only the active party Chief Whip can issue voting guidance",
        );
      }
      const [bill] = await tx
        .select({
          id: bills.id,
          title: bills.title,
          status: bills.status,
          stage: bills.stage,
          stageEndsAt: bills.stageEndsAt,
        })
        .from(bills)
        .where(eq(bills.id, data.billId))
        .limit(1);
      if (!bill) throw new Error("Bill not found");
      if (!canGuideBill(bill))
        throw new Error(
          "Voting guidance can only be set while a bill is queued for committee, in committee, or in voting",
        );
      const [existing] = await tx
        .select({
          position: billPartyWhips.position,
          enforcedAt: billPartyWhips.enforcedAt,
        })
        .from(billPartyWhips)
        .where(
          and(
            eq(billPartyWhips.billId, bill.id),
            eq(billPartyWhips.partyId, leader.partyId),
          ),
        )
        .limit(1);
      if (existing?.enforcedAt && existing.position !== data.position)
        throw new Error("An enforced whip cannot change direction");

      const enforcedAt =
        existing?.enforcedAt ?? (data.enforce ? new Date() : null);
      if (data.enforce && !existing?.enforcedAt) {
        const [recent] = await tx
          .select({ id: billPartyWhips.id })
          .from(billPartyWhips)
          .where(
            and(
              eq(billPartyWhips.partyId, leader.partyId),
              isNotNull(billPartyWhips.enforcedAt),
              gt(
                billPartyWhips.enforcedAt,
                new Date(Date.now() - 24 * 60 * 60 * 1000),
              ),
            ),
          )
          .limit(1);
        if (recent)
          throw new Error(
            "Your party can enforce only one bill every 24 hours",
          );
      }

      await tx
        .insert(billPartyWhips)
        .values({
          billId: bill.id,
          partyId: leader.partyId,
          leaderUserId: leader.id,
          position: data.position,
          note: data.note || null,
          enforcedAt,
        })
        .onConflictDoUpdate({
          target: [billPartyWhips.billId, billPartyWhips.partyId],
          set: {
            leaderUserId: leader.id,
            position: data.position,
            note: data.note || null,
            enforcedAt,
            updatedAt: sql`now()`,
          },
        });
      await tx.insert(feed).values({
        userId: leader.id,
        content: `${existing ? "updated" : "issued"} ${data.position.toLowerCase()} voting guidance for ${leader.partyName} on bill #${bill.id}: ${bill.title}${data.enforce && !existing?.enforcedAt ? ". Enforced the party whip: members voting against it must change their vote by the end of each voting stage or be ejected from the party; abstention is allowed." : existing?.enforcedAt ? ". The party whip remains enforced: final contrary votes at stage close lead to ejection." : "."}`,
      });
      return { success: true };
    });
  });
