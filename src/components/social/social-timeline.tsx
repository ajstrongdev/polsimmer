import { instance } from "@/lib/instance-config";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowBigDown,
  ArrowBigUp,
  ChevronDown,
  ChevronRight,
  Link2,
  MessageCircle,
  Quote,
  Repeat2,
  UserPlus,
} from "lucide-react";
import dayjs from "dayjs";
import { toast } from "sonner";
import relativeTime from "dayjs/plugin/relativeTime";
import type { CommentNode } from "@/lib/social-comment-tree";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PartyMark } from "@/components/wiki/wiki-header";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { SocialAccountAvatar } from "@/components/social/social-account-avatar";
import { MarkdownToolbar } from "@/components/markdown-toolbar";
import { MarkdownContent } from "@/components/wiki/markdown-content";
import {
  buildCommentTree,
  countThreadReplies,
} from "@/lib/social-comment-tree";
import {
  addSocialComment,
  createSocialPost,
  getSocialComments,
  toggleSocialCommentVote,
  toggleSocialFollow,
  toggleSocialRepost,
  toggleSocialVote,
} from "@/lib/server/social/social";
import { socialChangeEvent } from "@/components/notifications/live-updates";
import { mentionDraft } from "@/lib/social/mention-draft";

dayjs.extend(relativeTime);

export type SocialEntry = {
  entryType: "post" | "repost";
  entryId: number;
  postId: number;
  actorUserId: number | null;
  actorUsername: string;
  reposterUsername: string | null;
  occurredAt: Date;
  authorUserId: number | null;
  authorUsername: string;
  authorPhotoUrl: string | null;
  accountKey: string | null;
  accountPartyId: number | null;
  accountPartyName: string | null;
  accountPartyColor: string | null;
  accountPartyLogo: string | null;
  publisherUsername: string;
  publisherUserId: number | null;
  authorPartyId: number | null;
  authorPartyName: string | null;
  authorPartyColor: string | null;
  isPartyLeader: boolean;
  content: string;
  quotedPostId: number | null;
  quotedContent: string | null;
  quotedAuthorUsername: string | null;
  quotedAccountKey: string | null;
  commentCount: number;
  score: number;
  repostCount: number;
  viewerLiked: boolean;
  viewerDisliked: boolean;
  viewerReposted: boolean;
  viewerFollowsAuthor: boolean;
  viewerFollowsActor: boolean;
};

type SocialComment = {
  id: number;
  parentId: number | null;
  userId: number | null;
  username: string;
  photoUrl: string | null;
  content: string;
  createdAt: Date;
  score: number;
  viewerLiked: boolean;
  viewerDisliked: boolean;
};

export function SocialTimeline({
  entries,
  onRefresh,
  emptyMessage = `It’s quiet on ${instance.branding.socialName}. Be the first to post.`,
  openCommentsForPostId,
  highlightCommentId,
  viewerId,
  embedded = false,
}: {
  entries: Array<SocialEntry>;
  onRefresh: () => Promise<void>;
  emptyMessage?: string;
  openCommentsForPostId?: number;
  highlightCommentId?: number;
  viewerId?: number | null;
  embedded?: boolean;
}) {
  return (
    <div
      className={
        embedded
          ? "divide-y"
          : "divide-y overflow-hidden rounded-2xl border bg-card"
      }
    >
      {entries.length ? (
        entries.map((entry) => (
          <SocialPost
            key={`${entry.entryType}-${entry.entryId}`}
            entry={entry}
            onRefresh={onRefresh}
            viewerId={viewerId}
            openCommentsInitially={
              entry.entryType === "post" &&
              entry.postId === openCommentsForPostId
            }
            highlightCommentId={
              entry.entryType === "post" &&
              entry.postId === openCommentsForPostId
                ? highlightCommentId
                : undefined
            }
          />
        ))
      ) : (
        <div className="px-5 py-12 text-center text-sm leading-6 text-muted-foreground">
          {emptyMessage}
        </div>
      )}
    </div>
  );
}

function SocialPost({
  entry,
  onRefresh,
  highlightCommentId,
  viewerId,
  openCommentsInitially = false,
}: {
  entry: SocialEntry;
  onRefresh: () => Promise<void>;
  highlightCommentId?: number;
  viewerId?: number | null;
  openCommentsInitially?: boolean;
}) {
  const [comments, setComments] = useState<Array<SocialComment>>([]);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [comment, setComment] = useState("");
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteText, setQuoteText] = useState("");
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [votingComments, setVotingComments] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const commentTree = buildCommentTree(comments);

  const follow = async (userId: number) => {
    setBusy(true);
    setError(null);
    try {
      await toggleSocialFollow({ data: { userId } });
      await onRefresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update follow.",
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!commentsOpen) return;
    let active = true;
    const updateComments = () => {
      void getSocialComments({ data: { postId: entry.postId } })
        .then((rows) => {
          if (active) {
            setComments(rows);
            setCommentsLoaded(true);
          }
        })
        .catch(() => {
          /* Retry on reconnect/focus without losing a draft. */
        });
    };
    window.addEventListener(socialChangeEvent, updateComments);
    return () => {
      active = false;
      window.removeEventListener(socialChangeEvent, updateComments);
    };
  }, [commentsOpen, entry.postId]);

  useEffect(() => {
    if (!openCommentsInitially) return;
    setCommentsOpen(true);
    setCommentsLoaded(false);
    getSocialComments({ data: { postId: entry.postId } })
      .then((rows) => {
        setComments(rows);
        setCommentsLoaded(true);
      })
      .catch(() => setError("Could not load comments."));
  }, [entry.postId, highlightCommentId, openCommentsInitially]);

  useEffect(() => {
    if (!commentsLoaded || !highlightCommentId) return;
    let frame = 0;
    let attempts = 0;
    const scrollToComment = () => {
      const target = document.getElementById(`z-comment-${highlightCommentId}`);
      if (target) target.scrollIntoView({ block: "center" });
      else if (attempts++ < 10) frame = requestAnimationFrame(scrollToComment);
    };
    frame = requestAnimationFrame(scrollToComment);
    return () => cancelAnimationFrame(frame);
  }, [commentsLoaded, highlightCommentId]);

  const openComments = async () => {
    const nextOpen = !commentsOpen;
    if (nextOpen) {
      setComment((draft) =>
        mentionDraft(
          draft,
          entry.accountKey ? entry.publisherUsername : entry.authorUsername,
        ),
      );
    }
    setCommentsOpen(nextOpen);
    if (nextOpen && !commentsLoaded) {
      try {
        const rows = await getSocialComments({
          data: { postId: entry.postId },
        });
        setComments(rows);
        setCommentsLoaded(true);
      } catch {
        setError("Could not load comments.");
      }
    }
  };

  const submitComment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await addSocialComment({
        data: { postId: entry.postId, content: comment },
      });
      setComment("");
      const rows = await getSocialComments({ data: { postId: entry.postId } });
      setComments(rows);
      setCommentsLoaded(true);
      await onRefresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not post comment.",
      );
    } finally {
      setBusy(false);
    }
  };

  const replyToComment = async (parentId: number, content: string) => {
    await addSocialComment({
      data: { postId: entry.postId, parentId, content },
    });
    const rows = await getSocialComments({ data: { postId: entry.postId } });
    setComments(rows);
    setCommentsLoaded(true);
    await onRefresh();
  };

  const vote = async (direction: "up" | "down") => {
    setBusy(true);
    setError(null);
    try {
      await toggleSocialVote({
        data: { postId: entry.postId, vote: direction },
      });
      await onRefresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update vote.",
      );
    } finally {
      setBusy(false);
    }
  };

  const toggleRepost = async () => {
    setBusy(true);
    setError(null);
    try {
      await toggleSocialRepost({ data: { postId: entry.postId } });
      await onRefresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update repost.",
      );
    } finally {
      setBusy(false);
    }
  };

  const submitQuote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setQuoteError(null);
    try {
      await createSocialPost({
        data: {
          content: quoteText,
          accountKey: "player",
          quotedPostId: entry.postId,
        },
      });
      setQuoteText("");
      setQuoteOpen(false);
      await onRefresh();
      toast.success("Quote posted");
    } catch (cause) {
      setQuoteError(
        cause instanceof Error ? cause.message : "Could not post quote.",
      );
    } finally {
      setBusy(false);
    }
  };

  const copyPostLink = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/dashboard/social?postId=${entry.postId}`,
      );
      toast.success("Link to post copied");
    } catch {
      toast.error(
        "Could not copy the link. Open the post to share its address.",
      );
    }
  };

  const voteOnComment = async (commentId: number, direction: "up" | "down") => {
    if (votingComments.has(commentId)) return;
    setVotingComments((current) => new Set(current).add(commentId));
    setError(null);
    try {
      const { vote: result } = await toggleSocialCommentVote({
        data: { commentId, vote: direction },
      });
      setComments((current) =>
        current.map((item) =>
          item.id === commentId
            ? {
                ...item,
                score:
                  item.score +
                  (result === "up" ? 1 : result === "down" ? -1 : 0) -
                  (item.viewerLiked ? 1 : item.viewerDisliked ? -1 : 0),
                viewerLiked: result === "up",
                viewerDisliked: result === "down",
              }
            : item,
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not update reply vote.",
      );
    } finally {
      setVotingComments((current) => {
        const next = new Set(current);
        next.delete(commentId);
        return next;
      });
    }
  };

  return (
    <article className="min-w-0 space-y-3 bg-transparent p-4 transition-colors hover:bg-muted/15">
      {entry.entryType === "repost" && (
        <div className="flex items-center gap-2 pl-[3.25rem] text-xs font-medium text-muted-foreground sm:pl-[3.75rem]">
          <Repeat2 className="h-3.5 w-3.5" />
          {entry.actorUserId ? (
            <Link
              to="/dashboard/players/$playerId"
              params={{ playerId: String(entry.actorUserId) }}
              className="hover:text-primary hover:underline"
            >
              @{entry.reposterUsername}
            </Link>
          ) : (
            entry.reposterUsername
          )}{" "}
          reposted
          {entry.actorUserId && viewerId && viewerId !== entry.actorUserId && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto h-7 text-xs"
              disabled={busy}
              onClick={() => follow(entry.actorUserId!)}
            >
              {entry.viewerFollowsActor ? "Following" : "Follow"}
            </Button>
          )}
        </div>
      )}
      <div className="flex items-start gap-3 sm:gap-4">
        {entry.accountKey === "party" ? (
          <SocialAccountAvatar
            account="party"
            name={entry.accountPartyName}
            color={entry.accountPartyColor}
            logo={entry.accountPartyLogo}
            className="size-10 text-sm sm:size-11"
          />
        ) : entry.accountKey === "potro" ? (
          <SocialAccountAvatar account="potro" className="size-10 sm:size-11" />
        ) : (
          <PlayerAvatar
            username={entry.authorUsername}
            photoUrl={entry.authorPhotoUrl}
            className="size-10 sm:size-11"
          />
        )}
        <div className="min-w-0 flex-1">
          <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 pt-1">
              {entry.accountKey === "party" && entry.accountPartyId ? (
                <Link
                  to="/dashboard/parties/$partyId"
                  params={{ partyId: String(entry.accountPartyId) }}
                  className="font-semibold text-foreground hover:text-primary hover:underline"
                >
                  {entry.accountPartyName ?? entry.authorUsername}
                </Link>
              ) : entry.authorUserId ? (
                <Link
                  to="/dashboard/players/$playerId"
                  params={{ playerId: String(entry.authorUserId) }}
                  className="font-semibold text-foreground hover:text-primary hover:underline"
                >
                  @{entry.authorUsername}
                </Link>
              ) : (
                <strong className="text-foreground">
                  @{entry.authorUsername}
                </strong>
              )}
              {entry.accountKey === "potro" ? (
                <Badge>Official account</Badge>
              ) : entry.accountKey === "party" ? (
                <Badge variant="outline">Party account</Badge>
              ) : (
                entry.isPartyLeader && (
                  <Badge variant="outline">Party leader</Badge>
                )
              )}
              {entry.accountKey !== "party" &&
                entry.accountKey !== "potro" &&
                entry.authorPartyId && (
                  <PartyMark
                    name={entry.authorPartyName}
                    color={entry.authorPartyColor}
                  />
                )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                to="/dashboard/social"
                search={{ postId: entry.postId, commentId: undefined }}
                className="text-xs text-muted-foreground hover:text-primary hover:underline"
                aria-label={`Open post and comments from ${entry.authorUsername}`}
              >
                <time
                  dateTime={new Date(entry.occurredAt).toISOString()}
                  title={dayjs(entry.occurredAt).format("MMMM D, YYYY h:mm A")}
                >
                  {dayjs(entry.occurredAt).fromNow()}
                </time>
              </Link>
              {entry.accountKey == null &&
                entry.authorUserId &&
                viewerId &&
                viewerId !== entry.authorUserId && (
                  <Button
                    type="button"
                    size="sm"
                    variant={entry.viewerFollowsAuthor ? "ghost" : "outline"}
                    className="h-7 rounded-full px-2.5 text-xs"
                    disabled={busy}
                    onClick={() => follow(entry.authorUserId!)}
                    aria-label={`${entry.viewerFollowsAuthor ? "Unfollow" : "Follow"} ${entry.authorUsername}`}
                  >
                    {!entry.viewerFollowsAuthor && (
                      <UserPlus className="size-3.5" />
                    )}
                    {entry.viewerFollowsAuthor ? "Following" : "Follow"}
                  </Button>
                )}
            </div>
          </header>
          {entry.accountKey === "party" && (
            <p className="text-xs text-muted-foreground">
              @
              {entry.accountPartyName
                ?.toLowerCase()
                .trim()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "")}
              {" · "}
              Posted by{" "}
              {entry.publisherUserId ? (
                <Link
                  to="/dashboard/players/$playerId"
                  params={{ playerId: String(entry.publisherUserId) }}
                  className="hover:text-primary hover:underline"
                >
                  @{entry.publisherUsername}
                </Link>
              ) : (
                `@${entry.publisherUsername}`
              )}
            </p>
          )}
          <div className="mt-2 break-words text-[0.95rem] leading-7">
            <MarkdownContent content={entry.content} compact />
          </div>
          {entry.quotedPostId && entry.quotedContent && (
            <Link
              to="/dashboard/social"
              search={{ postId: entry.quotedPostId, commentId: undefined }}
              className="mt-3 block rounded-xl border p-3 transition-colors hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-primary"
              aria-label={`Open quoted post by ${entry.quotedAuthorUsername}`}
            >
              <span className="block text-sm font-semibold">
                {entry.quotedAccountKey
                  ? entry.quotedAuthorUsername
                  : `@${entry.quotedAuthorUsername}`}
              </span>
              <span className="mt-1 block line-clamp-4 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                {entry.quotedContent}
              </span>
            </Link>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-1 sm:pl-[3.75rem]">
        <div
          className="inline-flex items-center rounded-full bg-muted/50 p-0.5"
          aria-label={`Post score ${entry.score}`}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={`rounded-full ${entry.viewerLiked ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
            aria-label={entry.viewerLiked ? "Remove upvote" : "Upvote post"}
            aria-pressed={entry.viewerLiked}
            disabled={busy}
            onClick={() => vote("up")}
          >
            <ArrowBigUp
              className={`size-5 ${entry.viewerLiked ? "fill-current" : ""}`}
            />
          </Button>
          <span
            className="min-w-8 px-1 text-center font-mono text-sm font-bold tabular-nums"
            aria-live="polite"
          >
            {entry.score}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={`rounded-full ${entry.viewerDisliked ? "bg-rose-500/15 text-rose-600" : "text-muted-foreground"}`}
            aria-label={
              entry.viewerDisliked ? "Remove downvote" : "Downvote post"
            }
            aria-pressed={entry.viewerDisliked}
            disabled={busy}
            onClick={() => vote("down")}
          >
            <ArrowBigDown
              className={`size-5 ${entry.viewerDisliked ? "fill-current" : ""}`}
            />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label={commentsOpen ? "Hide comments" : "Show comments"}
          aria-expanded={commentsOpen}
          disabled={busy}
          onClick={openComments}
          className="rounded-xl px-3 text-muted-foreground"
        >
          <MessageCircle className="mr-1 h-4 w-4" /> {entry.commentCount}{" "}
          <span className="hidden sm:inline">comments</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={entry.viewerReposted ? "Undo repost" : "Repost"}
          aria-pressed={entry.viewerReposted}
          disabled={busy}
          onClick={toggleRepost}
          className={`rounded-xl px-3 ${entry.viewerReposted ? "bg-emerald-500/10 text-emerald-700" : "text-muted-foreground"}`}
        >
          <Repeat2 className="mr-1 h-4 w-4" /> {entry.repostCount}{" "}
          <span className="hidden sm:inline">reposts</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={quoteOpen}
          aria-label="Quote post with commentary"
          className="rounded-xl px-2 text-muted-foreground"
          onClick={() => {
            setQuoteError(null);
            setQuoteOpen((open) => !open);
          }}
        >
          <Quote className="size-4" />{" "}
          <span className="hidden sm:inline">Quote</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={copyPostLink}
          className="rounded-xl px-3 text-muted-foreground"
          aria-label="Copy link to post"
        >
          <Link2 className="size-4" />
          <span className="hidden sm:inline">Share</span>
        </Button>
      </div>
      {error && !commentsOpen && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {quoteOpen && (
        <form
          onSubmit={submitQuote}
          className="space-y-3 border-t pt-4 sm:ml-[3.75rem]"
          aria-label="Quote this post"
        >
          <p className="text-sm font-medium">
            Add your thoughts to{" "}
            {entry.accountKey
              ? entry.authorUsername
              : `@${entry.authorUsername}`}
            ’s post
          </p>
          <Textarea
            id={`social-quote-${entry.postId}`}
            value={quoteText}
            onChange={(event) => setQuoteText(event.target.value)}
            placeholder="What would you add?"
            maxLength={280}
            rows={2}
            required
            className="rounded-xl"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <MarkdownToolbar
              textareaId={`social-quote-${entry.postId}`}
              value={quoteText}
              onChange={setQuoteText}
            />
            <div className="flex items-center gap-2">
              <span className="text-xs tabular-nums text-muted-foreground">
                {quoteText.length}/280
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setQuoteOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={busy || !quoteText.trim() || quoteText.length > 280}
              >
                {busy ? "Posting…" : "Post quote"}
              </Button>
            </div>
          </div>
          {quoteError && (
            <p role="alert" className="text-sm text-destructive">
              {quoteError}
            </p>
          )}
        </form>
      )}
      {commentsOpen && (
        <div className="space-y-3 border-t pt-4 sm:ml-[3.75rem]">
          {!commentsLoaded && !error && (
            <p role="status" className="text-sm text-muted-foreground">
              Loading comments…
            </p>
          )}
          {commentTree.map((node) => (
            <CommentThread
              key={node.comment.id}
              node={node}
              depth={0}
              votingComments={votingComments}
              onVote={voteOnComment}
              onReply={replyToComment}
              highlightCommentId={highlightCommentId}
            />
          ))}
          {!comments.length && commentsLoaded && (
            <p className="text-sm text-muted-foreground">No comments yet.</p>
          )}
          <form onSubmit={submitComment} className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                Markdown and references supported
              </span>
              <MarkdownToolbar
                textareaId={`social-comment-${entry.postId}`}
                value={comment}
                onChange={setComment}
              />
            </div>
            <Textarea
              id={`social-comment-${entry.postId}`}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Add a comment…"
              maxLength={2_000}
              required
              rows={2}
              className="rounded-xl"
            />
            <div className="flex items-center justify-between gap-3">
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button
                size="sm"
                type="submit"
                className="rounded-xl"
                disabled={busy || !comment.trim() || comment.length > 2_000}
              >
                Post comment
              </Button>
            </div>
          </form>
        </div>
      )}
    </article>
  );
}

function CommentThread({
  node,
  depth,
  votingComments,
  onVote,
  onReply,
  highlightCommentId,
}: {
  node: CommentNode<SocialComment>;
  depth: number;
  votingComments: Set<number>;
  onVote: (id: number, direction: "up" | "down") => Promise<void>;
  onReply: (parentId: number, content: string) => Promise<void>;
  highlightCommentId?: number;
}) {
  const { comment, replies } = node;
  const [collapsed, setCollapsed] = useState(depth >= 3);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const replyCount = countThreadReplies(node);

  useEffect(() => {
    if (highlightCommentId && containsComment(node, highlightCommentId)) {
      setCollapsed(false);
    }
  }, [highlightCommentId, node]);

  const submitReply = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setReplyBusy(true);
    setReplyError(null);
    try {
      await onReply(comment.id, replyText);
      setReplyText("");
      setReplyOpen(false);
      setCollapsed(false);
    } catch (cause) {
      setReplyError(
        cause instanceof Error ? cause.message : "Could not post reply.",
      );
    } finally {
      setReplyBusy(false);
    }
  };

  return (
    <div
      className={
        depth > 0
          ? `border-l border-border pl-3 sm:pl-4 ${depth <= 2 ? "ml-3 sm:ml-5" : ""}`
          : ""
      }
    >
      <article
        id={`z-comment-${comment.id}`}
        className={`scroll-mt-24 py-3 ${comment.id === highlightCommentId ? "-mx-2 rounded-lg bg-primary/10 px-2 ring-1 ring-primary/30" : ""}`}
      >
        <div className="flex items-start gap-3">
          <PlayerAvatar
            username={comment.username}
            photoUrl={comment.photoUrl}
            className="size-8 sm:size-9"
          />
          <div className="min-w-0 flex-1 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              {comment.userId ? (
                <Link
                  to="/dashboard/players/$playerId"
                  params={{ playerId: String(comment.userId) }}
                  className="font-semibold hover:text-primary hover:underline"
                >
                  @{comment.username}
                </Link>
              ) : (
                <strong>@{comment.username}</strong>
              )}
              <time
                className="text-xs text-muted-foreground"
                dateTime={new Date(comment.createdAt).toISOString()}
              >
                {dayjs(comment.createdAt).fromNow()}
              </time>
            </div>
            <div className="mt-1">
              <MarkdownContent content={comment.content} compact />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <div
                className="inline-flex items-center rounded-full bg-muted/50 p-0.5"
                aria-label={`Reply score ${comment.score}`}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className={`rounded-full ${comment.viewerLiked ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
                  aria-label={
                    comment.viewerLiked
                      ? `Remove upvote on reply by ${comment.username}`
                      : `Upvote reply by ${comment.username}`
                  }
                  aria-pressed={comment.viewerLiked}
                  disabled={votingComments.has(comment.id)}
                  onClick={() => onVote(comment.id, "up")}
                >
                  <ArrowBigUp
                    className={`size-4 ${comment.viewerLiked ? "fill-current" : ""}`}
                  />
                </Button>
                <span
                  className="min-w-7 px-1 text-center font-mono text-xs font-bold tabular-nums"
                  aria-live="polite"
                >
                  {comment.score}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className={`rounded-full ${comment.viewerDisliked ? "bg-rose-500/15 text-rose-600" : "text-muted-foreground"}`}
                  aria-label={
                    comment.viewerDisliked
                      ? `Remove downvote on reply by ${comment.username}`
                      : `Downvote reply by ${comment.username}`
                  }
                  aria-pressed={comment.viewerDisliked}
                  disabled={votingComments.has(comment.id)}
                  onClick={() => onVote(comment.id, "down")}
                >
                  <ArrowBigDown
                    className={`size-4 ${comment.viewerDisliked ? "fill-current" : ""}`}
                  />
                </Button>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-xl text-muted-foreground"
                aria-expanded={replyOpen}
                onClick={() => {
                  setReplyOpen((value) => !value);
                  if (!replyOpen)
                    setReplyText((draft) =>
                      mentionDraft(draft, comment.username),
                    );
                }}
              >
                <MessageCircle className="size-4" /> Reply
              </Button>
              {replyCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-xl text-muted-foreground"
                  aria-expanded={!collapsed}
                  aria-controls={`comment-replies-${comment.id}`}
                  onClick={() => setCollapsed((value) => !value)}
                >
                  {collapsed ? (
                    <ChevronRight className="size-4" />
                  ) : (
                    <ChevronDown className="size-4" />
                  )}
                  {collapsed && depth >= 3
                    ? "Continue thread ·"
                    : collapsed
                      ? "Show"
                      : "Hide"}{" "}
                  {replyCount} {replyCount === 1 ? "reply" : "replies"}
                </Button>
              )}
            </div>
            {replyOpen && (
              <form
                onSubmit={submitReply}
                className="mt-3 space-y-2 border-t pt-3"
              >
                <div className="flex justify-end">
                  <MarkdownToolbar
                    textareaId={`social-reply-${comment.id}`}
                    value={replyText}
                    onChange={setReplyText}
                  />
                </div>
                <Textarea
                  id={`social-reply-${comment.id}`}
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  placeholder={`Reply to @${comment.username}…`}
                  maxLength={2_000}
                  rows={2}
                  required
                  className="rounded-xl"
                  aria-label={`Reply to ${comment.username}`}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {replyError ? (
                    <p role="alert" className="text-xs text-destructive">
                      {replyError}
                    </p>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Replies can be threaded.
                    </span>
                  )}
                  <Button
                    type="submit"
                    size="sm"
                    className="rounded-xl"
                    disabled={
                      replyBusy || !replyText.trim() || replyText.length > 2_000
                    }
                  >
                    {replyBusy ? "Posting…" : "Post reply"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </article>
      {replies.length > 0 && (
        <div
          id={`comment-replies-${comment.id}`}
          hidden={collapsed}
          className="space-y-1"
        >
          {!collapsed &&
            replies.map((reply) => (
              <CommentThread
                key={reply.comment.id}
                node={reply}
                depth={depth + 1}
                votingComments={votingComments}
                onVote={onVote}
                onReply={onReply}
                highlightCommentId={highlightCommentId}
              />
            ))}
        </div>
      )}
    </div>
  );
}

function containsComment(
  node: CommentNode<SocialComment>,
  id: number,
): boolean {
  return (
    node.comment.id === id ||
    node.replies.some((reply) => containsComment(reply, id))
  );
}
