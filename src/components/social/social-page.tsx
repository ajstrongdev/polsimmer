import { instance } from "@/lib/instance-config";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Eye, FileText, Search, Send, X } from "lucide-react";
import type {
  AccountFilter,
  FeedSort,
  loadSocialData,
} from "@/lib/social/queries";
import type { SocialEntry } from "@/components/social/social-timeline";
import { SocialTimeline } from "@/components/social/social-timeline";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import ProtectedRoute from "@/components/auth/protected-route";
import { WikiPage } from "@/components/wiki/wiki-layout";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { MarkdownToolbar } from "@/components/markdown-toolbar";
import { MarkdownContent } from "@/components/wiki/markdown-content";
import { createSocialPost, getSocialFeed } from "@/lib/server/social/social";
import { searchDiscussionBills } from "@/lib/server/bills/bill-comments";
import { billCommentPostContent } from "@/lib/bill-comment-post";
import { socialFeedQuery } from "@/lib/social/queries";

type BillOption = Awaited<ReturnType<typeof searchDiscussionBills>>[number];

export function SocialContent({
  data,
  search,
}: {
  data: Awaited<ReturnType<typeof loadSocialData>>;
  search: { postId?: number; commentId?: number };
}) {
  const { viewer, entries: initialEntries, focusedEntry } = data;
  const { postId, commentId } = search;
  const [entries, setEntries] = useState<Array<SocialEntry>>(initialEntries);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [postAs, setPostAs] = useState<"player" | "potro" | "party">("player");
  const [hasMore, setHasMore] = useState(initialEntries.length === 20);
  const [account, setAccount] = useState<AccountFilter>("all");
  const [sort, setSort] = useState<FeedSort>("newest");
  const queryClient = useQueryClient();
  const feedQuery = useQuery({
    ...socialFeedQuery(account, sort),
    initialData:
      account === "all" && sort === "newest"
        ? { viewer, entries: initialEntries }
        : undefined,
  });
  const entriesRef = useRef(entries);
  const displayedFilter = useRef("all:newest");
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);
  const [feedBusy, setFeedBusy] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [billPickerOpen, setBillPickerOpen] = useState(false);
  const [billQuery, setBillQuery] = useState("");
  const [billOptions, setBillOptions] = useState<Array<BillOption>>([]);
  const [billSearchLoading, setBillSearchLoading] = useState(false);
  const [selectedBill, setSelectedBill] = useState<BillOption | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [newPostsCount, setNewPostsCount] = useState(0);

  useEffect(() => {
    if (postId && focusedEntry && !commentId) {
      document
        .getElementById("focused-z-post")
        ?.scrollIntoView({ block: "start" });
    }
  }, [postId, commentId, focusedEntry]);

  useEffect(() => {
    if (!feedQuery.data) return;
    if (feedBusy) return;
    const newest = feedQuery.data.entries.slice(0, 20);
    const filter = `${account}:${sort}`;
    if (displayedFilter.current !== filter) {
      displayedFilter.current = filter;
      setEntries(newest);
      setHasMore(feedQuery.data.entries.length > 20);
      setNewPostsCount(0);
      setFeedBusy(false);
      return;
    }
    const updated = new Map(
      newest.map((entry) => [`${entry.entryType}:${entry.entryId}`, entry]),
    );
    const visible = new Set(
      entriesRef.current.map((entry) => `${entry.entryType}:${entry.entryId}`),
    );
    const unseen = newest.filter(
      (entry) => !visible.has(`${entry.entryType}:${entry.entryId}`),
    );
    if (unseen.length)
      setNewPostsCount((count) => Math.max(count, unseen.length));
    // Update scores and counts in place, but never insert new posts into a reader's list.
    setEntries((current) =>
      current.map(
        (entry) => updated.get(`${entry.entryType}:${entry.entryId}`) ?? entry,
      ),
    );
  }, [feedQuery.data, account, sort, feedBusy]);

  useEffect(() => {
    if (!feedQuery.isError) return;
    setFeedBusy(false);
    setFeedError("Could not update the feed. Please try again.");
  }, [feedQuery.isError]);

  useEffect(() => {
    if (!billPickerOpen || postAs !== "player") return;
    let active = true;
    setBillSearchLoading(true);
    const timeout = setTimeout(() => {
      searchDiscussionBills({ data: { query: billQuery } })
        .then((options) => {
          if (active) {
            setBillOptions(options);
            setBillSearchLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setBillOptions([]);
            setBillSearchLoading(false);
          }
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [billQuery, billPickerOpen, postAs]);

  const refresh = async () => {
    const desired = Math.max(20, entries.length);
    const updated: Array<SocialEntry> = [];
    while (updated.length < desired + 1) {
      const limit = Math.min(50, desired + 1 - updated.length);
      const page = await getSocialFeed({
        data: { limit, offset: updated.length, account, sort },
      });
      updated.push(...page.entries);
      if (page.entries.length < limit) break;
    }
    setEntries(updated.slice(0, desired));
    setHasMore(updated.length > desired);
    setNewPostsCount(0);
  };

  const changeFeed = async (nextAccount: AccountFilter, nextSort: FeedSort) => {
    if (nextAccount === account && nextSort === sort && !feedError) return;
    setFeedBusy(true);
    setFeedError(null);
    setEntries([]);
    setHasMore(false);
    setAccount(nextAccount);
    setSort(nextSort);
    try {
      const latest = await queryClient.fetchQuery({
        ...socialFeedQuery(nextAccount, nextSort),
        staleTime: 0,
      });
      displayedFilter.current = `${nextAccount}:${nextSort}`;
      setEntries(latest.entries.slice(0, 20));
      setHasMore(latest.entries.length > 20);
      setNewPostsCount(0);
    } catch {
      setFeedError("Could not load the feed. Please try again.");
    } finally {
      setFeedBusy(false);
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createSocialPost({
        data: {
          content,
          accountKey: postAs,
          ...(selectedBill ? { billId: selectedBill.id } : {}),
          ...(postAs === "party" && viewer?.partyId
            ? { partyId: viewer.partyId }
            : {}),
        },
      });
      setContent("");
      setSelectedBill(null);
      setShowPreview(false);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not post");
    } finally {
      setBusy(false);
    }
  };

  const loadMore = async () => {
    setFeedBusy(true);
    setFeedError(null);
    try {
      const next = await getSocialFeed({
        data: { limit: 21, offset: entries.length, account, sort },
      });
      setEntries((current) => [...current, ...next.entries.slice(0, 20)]);
      setHasMore(next.entries.length > 20);
    } catch {
      setFeedError("Could not load more posts. Please try again.");
    } finally {
      setFeedBusy(false);
    }
  };

  const activeDiscussions = [...entries]
    .filter((entry) => entry.entryType === "post")
    .sort((a, b) => b.commentCount - a.commentCount)
    .slice(0, 3);

  return (
    <ProtectedRoute>
      <WikiPage className="max-w-7xl">
        <header className="border-b pb-4 sm:pb-5">
          <p className="wiki-kicker mb-1">The public square</p>
          <h1 className="font-serif text-3xl font-bold tracking-tight sm:text-4xl">
             {instance.branding.socialName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What’s happening in {instance.name}, right now.
          </p>
        </header>
        <div className="grid min-w-0 items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_15rem]">
           <section className="min-w-0" aria-label={`${instance.branding.socialName} timeline`}>
            <div className="overflow-hidden rounded-2xl border bg-card">
              <div className="border-b px-4 py-3">
                <h2 className="font-serif text-xl font-bold">
                  The conversation
                </h2>
                <p className="text-xs text-muted-foreground">
                  Posts, people and discussions
                </p>
              </div>
              <form
                onSubmit={submit}
                className="border-b p-4"
                aria-label="Create a post"
              >
                <div className="flex items-start gap-3">
                  <PlayerAvatar
                    username={viewer?.username ?? "Z"}
                    photoUrl={viewer?.photoUrl}
                    className="size-10 shrink-0"
                  />
                  <div className="min-w-0 flex-1 space-y-3">
                    <label className="block">
                      <span className="sr-only">Write a post</span>
                      <Textarea
                        id="social-post"
                        value={content}
                        onChange={(event) => setContent(event.target.value)}
                        placeholder={
                          selectedBill
                            ? `What do you think about Bill #${selectedBill.id}?`
                            : `What’s happening in ${instance.name}?`
                        }
                        maxLength={280}
                        rows={2}
                        required
                        className="field-sizing-fixed min-h-16 resize-y rounded-lg border-0 bg-transparent px-0 py-2 text-base leading-7 shadow-none focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 focus-visible:ring-0"
                      />
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Posting as{" "}
                      {postAs === "player"
                        ? `@${viewer?.username ?? "Player"}`
                        : postAs === "potro"
                          ? "POTRO"
                          : (viewer?.partyName ?? "your party")}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {postAs === "player" && (
                        <Popover
                          open={billPickerOpen}
                          onOpenChange={setBillPickerOpen}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant={selectedBill ? "secondary" : "outline"}
                              size="sm"
                              className="max-w-full gap-1.5"
                            >
                              <FileText className="size-4 shrink-0" />{" "}
                              <span className="truncate">
                                {selectedBill
                                  ? `Bill #${selectedBill.id}: ${selectedBill.title}`
                                  : "Attach a bill"}
                              </span>
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="start"
                            className="w-[min(22rem,calc(100vw-2rem))] p-2"
                          >
                            <div className="relative">
                              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                              <input
                                value={billQuery}
                                onChange={(event) =>
                                  setBillQuery(event.target.value)
                                }
                                placeholder="Search by title or bill number"
                                aria-label="Search bills"
                                maxLength={100}
                                className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
                              />
                            </div>
                            <div className="mt-2 max-h-60 overflow-y-auto">
                              {!billSearchLoading &&
                                billOptions.map((bill) => (
                                  <button
                                    key={bill.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedBill(bill);
                                      setBillPickerOpen(false);
                                      setBillQuery("");
                                    }}
                                    className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted"
                                  >
                                    <span className="shrink-0 font-semibold text-primary">
                                      #{bill.id}
                                    </span>
                                    <span className="min-w-0">
                                      <span className="block line-clamp-2">
                                        {bill.title}
                                      </span>
                                      <span className="text-xs text-muted-foreground">
                                        {bill.status}
                                      </span>
                                    </span>
                                  </button>
                                ))}
                              {billSearchLoading ? (
                                <p className="px-2 py-3 text-sm text-muted-foreground">
                                  Searching bills…
                                </p>
                              ) : (
                                !billOptions.length && (
                                  <p className="px-2 py-3 text-sm text-muted-foreground">
                                    No bills found.
                                  </p>
                                )
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                      {selectedBill && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setSelectedBill(null)}
                          aria-label="Remove attached bill"
                        >
                          <X className="size-4" />
                        </Button>
                      )}
                      <MarkdownToolbar
                        textareaId="social-post"
                        value={content}
                        onChange={setContent}
                      />
                      {content.trim() && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowPreview((show) => !show)}
                          aria-expanded={showPreview}
                        >
                          <Eye className="size-4" />{" "}
                          {showPreview ? "Hide preview" : "Preview"}
                        </Button>
                      )}
                    </div>
                    {selectedBill && (
                      <p className="text-xs text-muted-foreground">
                        This post will also appear in Bill #{selectedBill.id}’s
                        discussion.
                      </p>
                    )}
                    {showPreview && content.trim() && (
                      <div className="rounded-lg border bg-muted/20 p-3">
                        <p className="mb-2 text-xs font-semibold text-muted-foreground">
                          Preview
                        </p>
                        <MarkdownContent
                          content={
                            selectedBill
                              ? billCommentPostContent(selectedBill.id, content)
                              : content
                          }
                          compact
                        />
                      </div>
                    )}
                    {((viewer?.role === "President" && viewer.isActive) ||
                      (viewer?.partyId &&
                        viewer.partySocialMediaOfficerId === viewer.id)) && (
                      <fieldset className="space-y-2">
                        <legend className="text-xs font-semibold text-muted-foreground">
                          Post as
                        </legend>
                        <div className="flex flex-wrap gap-2">
                          {(
                            [
                              {
                                key: "player",
                                label: `@${viewer.username}`,
                              },
                              ...(viewer.partyId &&
                              viewer.partySocialMediaOfficerId === viewer.id
                                ? [
                                    {
                                      key: "party",
                                      label: viewer.partyName ?? "Party",
                                    },
                                  ]
                                : []),
                              ...(viewer.role === "President" && viewer.isActive
                                ? [{ key: "potro", label: "POTRO" }]
                                : []),
                            ] as Array<{
                              key: typeof postAs;
                              label: string;
                            }>
                          ).map((identity) => (
                            <Button
                              key={identity.key}
                              type="button"
                              size="sm"
                              variant={
                                postAs === identity.key ? "default" : "outline"
                              }
                              aria-pressed={postAs === identity.key}
                              onClick={() => {
                                setPostAs(identity.key);
                                setSelectedBill(null);
                                setBillPickerOpen(false);
                              }}
                            >
                              {identity.label}
                            </Button>
                          ))}
                        </div>
                      </fieldset>
                    )}
                    {error && (
                      <p role="alert" className="text-sm text-destructive">
                        {error}
                      </p>
                    )}
                    <div className="flex items-center justify-end gap-3 border-t pt-3">
                      <span
                        className={`font-mono text-xs tabular-nums ${content.length > 260 ? "text-destructive" : "text-muted-foreground"}`}
                        aria-live="polite"
                      >
                        {content.length}/280
                      </span>
                      <Button
                        type="submit"
                        className="min-w-32 rounded-full font-semibold"
                        disabled={
                          busy || !content.trim() || content.length > 280
                        }
                      >
                        <Send className="size-4" /> {busy ? "Posting…" : "Post"}
                      </Button>
                    </div>
                  </div>
                </div>
              </form>

              <div
                className="grid grid-cols-2 border-b"
                role="group"
                aria-label="Choose your feed"
              >
                {(["all", "following"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    disabled={feedBusy}
                    aria-pressed={
                      option === "following"
                        ? account === "following"
                        : account !== "following"
                    }
                    onClick={() => changeFeed(option, sort)}
                    className={`min-h-12 border-b-2 px-3 text-sm font-semibold transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-primary ${(option === "following" ? account === "following" : account !== "following") ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
                  >
                    {option === "following" ? "Following" : "Discover"}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 sm:px-5">
                <div
                  className="flex max-w-full gap-1 overflow-x-auto"
                  role="group"
                  aria-label="Filter posts by account"
                >
                  {(["all", "players", "parties", "potro"] as const).map(
                    (option) => (
                      <Button
                        key={option}
                        type="button"
                        size="sm"
                        variant={account === option ? "default" : "ghost"}
                        className="shrink-0 rounded-full capitalize"
                        disabled={feedBusy}
                        aria-pressed={account === option}
                        onClick={() => changeFeed(option, sort)}
                      >
                        {option === "potro" ? "POTRO" : option}
                      </Button>
                    ),
                  )}
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  Sort by
                  <select
                    aria-label="Sort posts"
                    value={sort}
                    disabled={feedBusy}
                    onChange={(event) =>
                      changeFeed(account, event.target.value as FeedSort)
                    }
                    className="rounded-full border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    <option value="newest">Newest</option>
                    <option value="popular">Most popular</option>
                    <option value="least-popular">Least popular</option>
                  </select>
                </label>
              </div>
              <p className="border-y px-3 py-2 text-xs text-muted-foreground sm:px-5">
                {account === "following"
                  ? "Posts and reposts from people you follow."
                  : `Explore original posts from across ${instance.name}. Reposts appear in Following.`}
              </p>
              {feedError && (
                <div
                  role="alert"
                  className="flex items-center justify-between gap-3 border-b px-4 py-3 text-sm text-destructive"
                >
                  <span>{feedError}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void changeFeed(account, sort)}
                  >
                    Retry
                  </Button>
                </div>
              )}
              {newPostsCount > 0 && !feedBusy && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full rounded-none border-b"
                  onClick={() => void refresh()}
                  aria-live="polite"
                >
                  Show {newPostsCount} new{" "}
                  {newPostsCount === 1 ? "post" : "posts"}
                </Button>
              )}
              {focusedEntry && (
                <div
                  id="focused-z-post"
                  className="scroll-mt-24 border-b bg-primary/5"
                >
                  <p className="border-b px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary">
                    {commentId ? "Comment in this conversation" : "Linked post"}
                  </p>
                  <SocialTimeline
                    embedded
                    entries={[focusedEntry]}
                    onRefresh={refresh}
                    viewerId={viewer?.id}
                    openCommentsForPostId={postId}
                    highlightCommentId={commentId}
                  />
                </div>
              )}
              {postId && !focusedEntry && (
                <p className="rounded-xl border p-4 text-sm text-muted-foreground">
                  This post is no longer available.
                </p>
              )}
              {feedBusy && !entries.length ? (
                <div
                  className="space-y-px overflow-hidden rounded-2xl border bg-border"
                  role="status"
                  aria-label="Loading posts"
                >
                  {[0, 1, 2].map((item) => (
                    <div key={item} className="flex gap-3 bg-card p-5">
                      <Skeleton className="size-11 shrink-0 rounded-full" />
                      <div className="w-full space-y-3">
                        <Skeleton className="h-4 w-1/3" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-4/5" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <SocialTimeline
                  embedded
                  viewerId={viewer?.id}
                  entries={
                    focusedEntry
                      ? entries.filter(
                          (entry) => entry.postId !== focusedEntry.postId,
                        )
                      : entries
                  }
                  onRefresh={refresh}
                  emptyMessage={
                    focusedEntry
                      ? "No other posts yet."
                      : account === "following"
                        ? "No posts from people you follow yet. Follow players from the town square to fill this feed."
                        : account === "all"
                          ? undefined
                          : "No posts match this filter yet."
                  }
                />
              )}
              {hasMore && (
                <div className="flex justify-center border-t p-4">
                  <Button
                    variant="outline"
                    className="w-full rounded-xl sm:w-auto"
                    disabled={feedBusy}
                    onClick={loadMore}
                  >
                    {feedBusy ? "Loading…" : "Load more posts"}
                  </Button>
                </div>
              )}
            </div>
          </section>

          <aside
            className="hidden 2xl:sticky 2xl:top-6 2xl:block"
             aria-label={`Discover on ${instance.branding.socialName}`}
          >
            <div className="border-b pb-3">
              <p className="wiki-kicker">Discover</p>
              <h2 className="mt-1 font-serif text-lg font-semibold">
                Active discussions
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Most discussed posts in this feed
              </p>
            </div>
            {activeDiscussions.length ? (
              <ol className="divide-y">
                {activeDiscussions.map((entry) => (
                  <li key={entry.postId}>
                    <Link
                      to="/dashboard/social"
                      search={{ postId: entry.postId, commentId: undefined }}
                      className="block py-3 hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <span className="block truncate text-xs text-muted-foreground">
                        @{entry.authorUsername}
                      </span>
                      <span className="mt-1 block line-clamp-2 text-sm font-medium leading-5">
                        {entry.content}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {entry.commentCount}{" "}
                        {entry.commentCount === 1 ? "reply" : "replies"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="py-4 text-sm text-muted-foreground">
                The conversation is just getting started.
              </p>
            )}
            <p className="mt-4 border-t pt-3 text-xs leading-5 text-muted-foreground">
              A public space for players, parties and the presidency.
            </p>
          </aside>
        </div>
      </WikiPage>
    </ProtectedRoute>
  );
}
