import { createFileRoute } from "@tanstack/react-router";
import { OAuth2Client } from "google-auth-library";
import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  billVotesHouse,
  billVotesPresidential,
  billVotesSenate,
  bills,
  feed,
} from "@/db/schema";
import { applyPartyWhipToVote } from "@/lib/server/bills/party-whip-vote";
import { archiveEmptyParties } from "@/lib/server/organizations/organization-lifecycle";
import { env } from "@/env";
import { getAdminAuth } from "@/lib/firebase-admin";
import { authorizeCronRequest } from "@/lib/server/scheduler/cron-auth";
import { lockCommitteeOutcome } from "@/lib/server/bills/committee";
import { applyPassedBillEffects } from "@/lib/server/bills/bill-effects";
import { settleDueExecutiveOrders } from "@/lib/server/nation/executive-orders";
import { recordIndicatedVotes } from "@/lib/server/bills/vote-indications";
import {
  fillBillStageQueues,
  lockBillStages,
} from "@/lib/server/bills/stage-queue";
import {
  getBillStageDurationMs,
  getGameSpeed,
} from "@/lib/server/scheduler/game-speed";

const oAuth2Client = new OAuth2Client();

export const Route = createFileRoute("/api/bill-advance")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authFailure = await authorizeCronRequest({
          request,
          env,
          verifySchedulerIdToken: async ({ idToken, audience }) => {
            const ticket = await oAuth2Client.verifyIdToken({
              idToken,
              audience,
            });

            return { email: ticket.getPayload()?.email };
          },
          verifyAdminIdToken: async ({ idToken }) => {
            const decoded = await getAdminAuth().verifyIdToken(idToken);
            return { email: decoded.email };
          },
        });

        if (authFailure) {
          return authFailure;
        }

        try {
          const stageDurationMs = getBillStageDurationMs(
            (await getGameSpeed()).multiplier,
          );
          await db.transaction(async (tx) => {
            await lockBillStages(tx);
            const now = new Date();

            const getResult = async (
              table:
                | typeof billVotesHouse
                | typeof billVotesSenate
                | typeof billVotesPresidential,
              billId: number,
            ) => {
              const rows = await tx
                .select({
                  voteYes: table.voteYes,
                  count: sql<number>`count(*)::int`,
                })
                .from(table)
                .where(eq(table.billId, billId))
                .groupBy(table.voteYes);
              return {
                yes: rows.find((row) => row.voteYes)?.count ?? 0,
                no: rows.find((row) => !row.voteYes)?.count ?? 0,
              };
            };

            const settleWhips = async (
              table:
                | typeof billVotesHouse
                | typeof billVotesSenate
                | typeof billVotesPresidential,
              billId: number,
            ) => {
              const votes = await tx
                .select({ userId: table.voterId, voteYes: table.voteYes })
                .from(table)
                .where(eq(table.billId, billId));
              for (const vote of votes)
                if (vote.userId !== null)
                  await applyPartyWhipToVote(
                    tx,
                    billId,
                    vote.userId,
                    vote.voteYes,
                  );
            };

            const presidential = await tx
              .select()
              .from(bills)
              .where(
                and(
                  eq(bills.stage, "Presidential"),
                  eq(bills.status, "Voting"),
                  lte(bills.stageEndsAt, now),
                ),
              );
            for (const bill of presidential) {
              const result = await getResult(billVotesPresidential, bill.id);
              await settleWhips(billVotesPresidential, bill.id);
              const status = result.yes > result.no ? "Passed" : "Defeated";
              await tx
                .update(bills)
                .set({ status, stageStartedAt: now, stageEndsAt: null })
                .where(and(eq(bills.id, bill.id), eq(bills.status, "Voting")));
              if (status === "Passed")
                await applyPassedBillEffects(tx, bill.id);
              await tx.insert(feed).values({
                content: `Bill #${bill.id}: ${bill.title} ${status === "Passed" ? "was signed into law" : "was defeated at the Presidential stage"}. Presidential vote: ${result.yes} for, ${result.no} against.`,
              });
            }

            const senate = await tx
              .select()
              .from(bills)
              .where(
                and(
                  eq(bills.stage, "Senate"),
                  eq(bills.status, "Voting"),
                  lte(bills.stageEndsAt, now),
                ),
              );
            for (const bill of senate) {
              const result = await getResult(billVotesSenate, bill.id);
              await settleWhips(billVotesSenate, bill.id);
              await tx
                .update(bills)
                .set(
                  result.yes > result.no
                    ? {
                        stage: "Presidential",
                        status: "Queued",
                        stageStartedAt: now,
                        stageEndsAt: null,
                      }
                    : {
                        status: "Defeated",
                        stageStartedAt: now,
                        stageEndsAt: null,
                      },
                )
                .where(and(eq(bills.id, bill.id), eq(bills.status, "Voting")));
              await tx.insert(feed).values({
                content: `Bill #${bill.id}: ${bill.title} ${result.yes > result.no ? "cleared the Senate and is queued for the President" : "was defeated in the Senate"}. Senate vote: ${result.yes} for, ${result.no} against.`,
              });
            }

            const house = await tx
              .select()
              .from(bills)
              .where(
                and(
                  eq(bills.stage, "House"),
                  eq(bills.status, "Voting"),
                  lte(bills.stageEndsAt, now),
                ),
              );
            for (const bill of house) {
              const result = await getResult(billVotesHouse, bill.id);
              await settleWhips(billVotesHouse, bill.id);
              await tx
                .update(bills)
                .set(
                  result.yes > result.no
                    ? {
                        stage: "Senate",
                        status: "Queued",
                        stageStartedAt: now,
                        stageEndsAt: null,
                      }
                    : {
                        status: "Defeated",
                        stageStartedAt: now,
                        stageEndsAt: null,
                      },
                )
                .where(and(eq(bills.id, bill.id), eq(bills.status, "Voting")));
              await tx.insert(feed).values({
                content: `Bill #${bill.id}: ${bill.title} ${result.yes > result.no ? "cleared the House and is queued for the Senate" : "was defeated in the House"}. House vote: ${result.yes} for, ${result.no} against.`,
              });
            }

            const committeeBills = await tx
              .select()
              .from(bills)
              .where(
                and(
                  eq(bills.stage, "House"),
                  eq(bills.status, "Committee"),
                  lte(bills.stageEndsAt, now),
                ),
              );
            for (const bill of committeeBills) {
              // lockCommitteeOutcome transitions Committee -> Voting and
              // queues the bill for a fresh House voting window.
              await lockCommitteeOutcome(tx, bill.id, now, stageDurationMs);
              await tx
                .update(bills)
                .set({
                  status: "Queued",
                  stageStartedAt: now,
                  stageEndsAt: null,
                })
                .where(eq(bills.id, bill.id));
            }
            const admitted = await fillBillStageQueues(
              tx,
              now,
              stageDurationMs,
            );
            // Indications only become votes once the bill is admitted to a chamber.
            for (const bill of admitted)
              if (bill.stage !== "Committee")
                await recordIndicatedVotes(tx, bill.id, bill.stage);
            await settleDueExecutiveOrders(tx, now);
          });

          try {
            await db.transaction((tx) => archiveEmptyParties(tx));
          } catch (error) {
            console.error("Error archiving zero-member parties:", error);
          }

          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          console.error("Error processing bill advance:", error);
          return new Response(
            JSON.stringify({
              success: false,
              error: "Internal Server Error",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
