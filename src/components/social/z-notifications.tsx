import { instance } from "@/lib/instance-config";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { ArrowRight, AtSign, BellOff, MessageCircle, X } from "lucide-react";
import type { getZNotificationPage } from "@/lib/server/notifications/social-notifications";
import {
  dismissZNotifications,
  getZNotificationPage as fetchNotifications,
} from "@/lib/server/notifications/social-notifications";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { SocialAccountAvatar } from "@/components/social/social-account-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { socialNotificationsQuery } from "@/lib/notifications/queries";

type NotificationPage = Awaited<ReturnType<typeof getZNotificationPage>>;

dayjs.extend(relativeTime);

export function ZNotifications({
  initialPage,
}: {
  initialPage: NotificationPage;
}) {
  const [page, setPage] = useState(initialPage);
  const queryClient = useQueryClient();
  const notifications = useQuery({
    ...socialNotificationsQuery(),
    initialData: initialPage,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    if (!notifications.data) return;
    const latest = notifications.data;
    setPage((current) => {
      if (current.entries.length <= 5) return latest;
      const ids = new Set(latest.entries.map((entry) => `${entry.accountKey}:${entry.sourceType}:${entry.sourceId}`));
      const remaining = current.entries.filter((entry) => !ids.has(`${entry.accountKey}:${entry.sourceType}:${entry.sourceId}`));
      // A background update should not collapse pages the reader has opened.
      const entries = [...latest.entries, ...remaining].slice(0, latest.notifications);
      return { ...latest, entries, hasMore: entries.length < latest.notifications };
    });
  }, [notifications.data]);

  const dismiss = async (entry?: NotificationPage["entries"][number]) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await dismissZNotifications({
        data: entry
          ? {
              scope: "one",
              accountKey: entry.accountKey,
              sourceType: entry.sourceType,
              sourceId: entry.sourceId,
            }
          : { scope: "all" },
      });
      const updated = await fetchNotifications({
        data: { limit: 5, offset: 0 },
      });
      queryClient.setQueryData(socialNotificationsQuery().queryKey, updated);
      setPage(updated);
      setConfirmAll(false);
    } catch {
      setError("Could not dismiss notifications. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const loadMore = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await fetchNotifications({
        data: { limit: 5, offset: page.entries.length },
      });
      setPage((current) => ({
        ...next,
        entries: [...current.entries, ...next.entries],
      }));
    } catch {
      setError("Could not load more notifications. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-semibold">
          {page.notifications}{" "}
          {page.notifications === 1 ? `${instance.branding.socialName} alert` : `${instance.branding.socialName} alerts`}
        </span>
        {page.notifications > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="rounded-lg text-muted-foreground"
            disabled={busy}
            onClick={() => setConfirmAll(true)}
          >
            <BellOff className="size-4" /> Dismiss all
          </Button>
        )}
      </div>
      {page.entries.length ? (
        <div className="divide-y overflow-hidden rounded-2xl border bg-card">
          {page.entries.map((entry) => (
            <article
              key={`${entry.accountKey}-${entry.sourceType}-${entry.sourceId}`}
              className="flex items-start gap-3 p-3 transition-colors hover:bg-muted/20 sm:p-4"
            >
              {entry.sourceAccountKey === "party" ||
              entry.sourceAccountKey === "potro" ? (
                <SocialAccountAvatar
                  account={entry.sourceAccountKey}
                  name={entry.actorUsername}
                  color={entry.sourcePartyColor}
                  logo={entry.sourcePartyLogo}
                  className="size-11 text-sm sm:size-11"
                />
              ) : (
                <PlayerAvatar
                  username={entry.actorUsername}
                  photoUrl={entry.photoUrl}
                  className="size-11"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm leading-5">
                  {entry.accountKey === "post-owner" ? <MessageCircle className="size-3.5 shrink-0 text-primary" /> : <AtSign className="size-3.5 shrink-0 text-primary" />}
                  <strong>
                  {entry.sourceAccountKey === "party" ||
                  entry.sourceAccountKey === "potro"
                    ? entry.actorUsername
                    : `@${entry.actorUsername}`}{" "}
                  </strong>
                  <span className="text-muted-foreground">
                     {entry.accountKey === "post-owner" ? "commented on" : "mentioned"}
                  </span>{" "}
                  {entry.accountLabel}
                </p>
                <p className="mt-2 line-clamp-2 break-words text-sm leading-6 text-foreground/80">
                  {entry.content}
                </p>
                <time
                  className="mt-1 block text-xs text-muted-foreground"
                  dateTime={new Date(entry.createdAt).toISOString()}
                  title={dayjs(entry.createdAt).format("MMMM D, YYYY h:mm A")}
                >
                  {dayjs(entry.createdAt).fromNow()}
                </time>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                   <Link
                     to="/dashboard/social"
                     search={{ postId: entry.postId, commentId: entry.commentId ?? undefined }}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    Open {entry.sourceType === "comment" ? "comment" : "post"}{" "}
                    <ArrowRight className="size-3" />
                   </Link>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 rounded-lg px-2 text-xs text-muted-foreground"
                    disabled={busy}
                    onClick={() => dismiss(entry)}
                  >
                    <X className="size-3.5" /> Dismiss
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
          You’re caught up. New mentions and comments on your posts will appear here.
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {notifications.isError && (
        <p role="alert" className="text-xs text-destructive">
          Could not refresh notifications. Showing the last available list.
        </p>
      )}
      {page.hasMore && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full rounded-xl"
          disabled={busy}
          onClick={loadMore}
        >
          Load more alerts
        </Button>
      )}
      <Dialog open={confirmAll} onOpenChange={setConfirmAll}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dismiss all notifications?</DialogTitle>
             <DialogDescription>This clears your current {instance.branding.socialName} notifications.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAll(false)}>Cancel</Button>
            <Button disabled={busy} onClick={() => dismiss()}>Dismiss all</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
