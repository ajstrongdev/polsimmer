import { instance } from "@/lib/instance-config";
import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import type { CommentNode } from "@/lib/social-comment-tree";
import { useAuth } from "@/lib/auth-context";
import { addBillComment, saveBillWhip } from "@/lib/server/bills/bill-comments";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { WikiEmpty, WikiSection } from "@/components/wiki/wiki-layout";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { MarkdownToolbar } from "@/components/markdown-toolbar";
import { MarkdownContent } from "@/components/wiki/markdown-content";
import { billCommentPostContent } from "@/lib/bill-comment-post";
import { buildCommentTree } from "@/lib/social-comment-tree";

type BillComment = {
  id: number;
  parentId: number | null;
  userId: number | null;
  username: string;
  photoUrl: string | null;
  partyName: string | null;
  isPartyLeader: boolean;
  content: string;
  createdAt: Date;
};

type PartyWhip = {
  id: number;
  partyId: number;
  partyName: string;
  partyColor: string;
  leaderUsername: string | null;
  position: string;
  note: string | null;
  updatedAt: Date;
  enforcedAt: Date | null;
};

export function BillComments({
  billId,
  comments,
  whips,
  currentPartyId,
  isChiefWhip,
  canWhip,
}: {
  billId: number;
  comments: Array<BillComment>;
  whips: Array<PartyWhip>;
  currentPartyId: number | null;
  isChiefWhip: boolean;
  canWhip: boolean;
}) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const currentWhip = whips.find((whip) => whip.partyId === currentPartyId);
  const [position, setPosition] = useState<"For" | "Against">(
    currentWhip?.position === "Against" ? "Against" : "For",
  );
  const [whipNote, setWhipNote] = useState(currentWhip?.note ?? "");
  const [whipError, setWhipError] = useState<string | null>(null);
  const [savingWhip, setSavingWhip] = useState(false);
  const [enforce, setEnforce] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await addBillComment({ data: { billId, content } });
      setContent("");
      await router.invalidate();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to post comment",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const submitWhip = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWhipError(null);
    if (
      enforce &&
      !currentWhip?.enforcedAt &&
      !window.confirm(
        "Enforce this whip for the entire bill? Members whose final vote opposes the party line when a voting stage closes will be ejected. Abstaining is allowed. This cannot be undone.",
      )
    )
      return;
    setSavingWhip(true);
    try {
      await saveBillWhip({
        data: { billId, position, note: whipNote, enforce },
      });
      await router.invalidate();
    } catch (cause) {
      setWhipError(
        cause instanceof Error
          ? cause.message
          : "Unable to save voting guidance",
      );
    } finally {
      setSavingWhip(false);
    }
  };

  return (
    <>
      <div id="party-guidance" className="scroll-mt-6">
        <WikiSection
          title="Party voting guidance"
          description="The Chief Whip can recommend a vote from the committee queue onward. They can enforce one bill every 24 hours; members whose final vote at a voting stage close opposes an enforced whip are ejected. Abstention is allowed."
        >
          {whips.length ? (
            <div className="space-y-3">
              {whips.map((whip) => (
                <div
                  key={whip.id}
                  className="rounded-md border bg-background p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: whip.partyColor }}
                    />
                    <strong>{whip.partyName}</strong>
                    <Badge
                      variant={
                        whip.position === "For" ? "default" : "destructive"
                      }
                    >
                      {whip.position}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Guidance from {whip.leaderUsername ?? "party leadership"}
                    </span>
                    {whip.enforcedAt && (
                      <Badge variant="destructive">
                        ENFORCED — a final vote against this position at stage
                        close ejects party members
                      </Badge>
                    )}
                  </div>
                  {whip.note && (
                    <div className="mt-2">
                      <MarkdownContent content={whip.note} compact />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No party guidance has been issued.
            </p>
          )}
          {canWhip && (
            <form
              onSubmit={submitWhip}
              className="mt-5 space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4"
            >
              <h3 className="font-semibold">
                {currentWhip
                  ? "Update your party’s guidance"
                  : "Issue guidance to your party"}
              </h3>
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium">
                  Recommended vote
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(["For", "Against"] as const).map((choice) => (
                    <label
                      key={choice}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border bg-background p-3 text-sm font-medium ${position === choice ? "border-primary ring-1 ring-primary" : ""}`}
                    >
                      <input
                        type="radio"
                        name={`guidance-${billId}`}
                        value={choice}
                        checked={position === choice}
                        onChange={() => setPosition(choice)}
                      />
                      Vote {choice.toLowerCase()}
                    </label>
                  ))}
                </div>
              </fieldset>
              {currentWhip?.enforcedAt && (
                <p
                  role="alert"
                  className="text-sm font-semibold text-destructive"
                >
                  Enforced whip: its direction cannot be changed. Members who
                  have a final contrary vote when a stage closes will be
                  ejected.
                </p>
              )}
              {!currentWhip?.enforcedAt && (
                <label className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-background p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-destructive"
                    checked={enforce}
                    onChange={(event) => setEnforce(event.target.checked)}
                    disabled={savingWhip}
                  />
                  <span>
                    <strong>Enforce the party whip on this bill</strong>
                    <br />
                    One bill per 24 hours. Members whose final vote opposes this
                    guidance when a voting stage closes will be ejected. They
                    can change their vote before the stage closes or abstain.
                    Enforcement lasts through later stages and cannot be undone.
                  </span>
                </label>
              )}
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="guidance-note" className="text-sm font-medium">
                  Reason (optional)
                </label>
                <MarkdownToolbar
                  textareaId="guidance-note"
                  value={whipNote}
                  onChange={setWhipNote}
                />
              </div>
              <Textarea
                id="guidance-note"
                value={whipNote}
                onChange={(event) => setWhipNote(event.target.value)}
                placeholder="Explain your position to party members… Markdown and references are supported."
                maxLength={1_000}
              />
              {whipNote.trim() && (
                <div className="rounded-lg border bg-background p-3">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">
                    Guidance preview
                  </p>
                  <MarkdownContent content={whipNote} compact />
                </div>
              )}
              <div className="flex justify-end">
                <Button type="submit" disabled={savingWhip}>
                  {savingWhip
                    ? "Saving…"
                    : currentWhip
                      ? "Update guidance"
                      : "Issue guidance"}
                </Button>
              </div>
              {whipError && (
                <p role="alert" className="text-sm text-destructive">
                  {whipError}
                </p>
              )}
            </form>
          )}
          {isChiefWhip && !canWhip && (
            <p className="mt-4 text-sm text-muted-foreground">
              You can issue or update guidance when this bill reaches the
              committee queue.
            </p>
          )}
        </WikiSection>
      </div>
      <WikiSection
        title="Discussion"
        description={`Comments are public and also appear on ${instance.branding.socialName} with a link back to this bill.`}
        aside={
          <span className="text-xs text-muted-foreground">
            {comments.length} comments
          </span>
        }
      >
        {!loading && user ? (
          <form onSubmit={submit} className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="bill-comment" className="text-sm font-medium">
                Add a comment
              </label>
              <MarkdownToolbar
                textareaId="bill-comment"
                value={content}
                onChange={setContent}
              />
            </div>
            <Textarea
              id="bill-comment"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Write a comment..."
              maxLength={5_000}
              required
              aria-label="Bill comment"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                Markdown and linked references supported · {content.length}
                /5,000 characters
              </span>
              <Button
                type="submit"
                disabled={
                  submitting || !content.trim() || content.length > 5_000
                }
              >
                {submitting ? "Posting…" : "Post comment"}
              </Button>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Sign in to join the discussion.
          </p>
        )}
        {content.trim() && (
          <div className="mt-4 rounded-lg border bg-muted/20 p-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
               Preview on {instance.branding.socialName}
            </p>
            <MarkdownContent
              content={billCommentPostContent(billId, content)}
              compact
            />
          </div>
        )}
        <div className="mt-5 space-y-4">
          {comments.length ? (
            buildCommentTree(comments).map((node) => (
              <BillCommentThread
                key={node.comment.id}
                node={node}
                billId={billId}
                canReply={!loading && !!user}
                depth={0}
              />
            ))
          ) : (
            <WikiEmpty>No comments yet. Start the discussion.</WikiEmpty>
          )}
        </div>
      </WikiSection>
    </>
  );
}

function BillCommentThread({
  node,
  billId,
  canReply,
  depth,
}: {
  node: CommentNode<BillComment>;
  billId: number;
  canReply: boolean;
  depth: number;
}) {
  const router = useRouter();
  const { comment, replies } = node;
  const [replyOpen, setReplyOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submitReply = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setReplyError(null);
    try {
      await addBillComment({
        data: { billId, parentId: comment.id, content: reply },
      });
      setReply("");
      setReplyOpen(false);
      await router.invalidate();
    } catch (cause) {
      setReplyError(
        cause instanceof Error ? cause.message : "Unable to post reply",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={
        depth === 0
          ? "border-t pt-4"
          : depth <= 3
            ? "ml-3 border-l-2 pl-3 sm:ml-5 sm:pl-5"
            : "border-l-2 pl-2"
      }
    >
      <article id={`bill-comment-${comment.id}`} className="scroll-mt-6">
        <header className="mb-2 flex flex-wrap items-center gap-2">
          <PlayerAvatar
            username={comment.username}
            photoUrl={comment.photoUrl}
            className="size-9"
          />
          <strong className="text-sm">{comment.username}</strong>
          <Badge variant="outline">{comment.partyName ?? "Independent"}</Badge>
          {comment.isPartyLeader && <Badge>Party Leader</Badge>}
          <time
            className="ml-auto text-xs text-muted-foreground"
            dateTime={new Date(comment.createdAt).toISOString()}
          >
            {new Date(comment.createdAt).toLocaleString()}
          </time>
        </header>
        <MarkdownContent content={comment.content} compact />
        {canReply && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => setReplyOpen((open) => !open)}
            aria-expanded={replyOpen}
          >
            Reply
          </Button>
        )}
        {replyOpen && (
          <form
            onSubmit={submitReply}
            className="mt-2 space-y-2 rounded-lg border bg-muted/20 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor={`bill-reply-${comment.id}`}
                className="text-sm font-medium"
              >
                Reply to {comment.username}
              </label>
              <MarkdownToolbar
                textareaId={`bill-reply-${comment.id}`}
                value={reply}
                onChange={setReply}
              />
            </div>
            <Textarea
              id={`bill-reply-${comment.id}`}
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              maxLength={5_000}
              required
              placeholder="Write a reply… Markdown and references supported."
            />
            {replyError && (
              <p role="alert" className="text-sm text-destructive">
                {replyError}
              </p>
            )}
            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                disabled={busy || !reply.trim() || reply.length > 5_000}
              >
                {busy ? "Posting…" : "Post reply"}
              </Button>
            </div>
          </form>
        )}
      </article>
      {replies.length > 0 && (
        <div className="mt-3 space-y-3">
          {replies.map((child) => (
            <BillCommentThread
              key={child.comment.id}
              node={child}
              billId={billId}
              canReply={canReply}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
