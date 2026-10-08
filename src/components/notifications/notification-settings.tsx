import { instance } from "@/lib/instance-config";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { canUseWebPush, disableBrowserPush, enableBrowserPush } from "@/lib/notifications/browser-push";
import { getNotificationSettings, saveNotificationSettings } from "@/lib/server/notifications/preferences";

type Settings = Awaited<ReturnType<typeof getNotificationSettings>>;

function timeValue(value: number | null, fallback: string) {
  if (value === null) return fallback;
  return `${Math.floor(value / 60).toString().padStart(2, "0")}:${(value % 60).toString().padStart(2, "0")}`;
}

function minutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function NotificationSettings() {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["notifications", "settings"], queryFn: getNotificationSettings });
  const [draft, setDraft] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (settings.data) setDraft(settings.data); }, [settings.data]);

  if (settings.isPending) return <p className="text-sm text-muted-foreground">Loading notification preferences…</p>;
  if (settings.isError || !draft) return (
    <div role="alert" className="space-y-2 text-sm">
      <p>Could not load notification preferences.</p>
      <Button variant="outline" onClick={() => void settings.refetch()}>Try again</Button>
    </div>
  );

  const save = async () => {
    setBusy(true);
    try {
      await saveNotificationSettings({ data: {
        pushMentions: draft.pushMentions,
        pushNextMoves: draft.pushNextMoves,
        pushPreview: draft.pushPreview,
        quietStart: draft.quietStart,
        quietEnd: draft.quietEnd,
        timeZone: draft.timeZone,
      } });
      if (!draft.pushMentions && !draft.pushNextMoves) await disableBrowserPush(false);
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Notification preferences saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save preferences");
    } finally {
      setBusy(false);
    }
  };

  const enable = async () => {
    if (!draft.vapidPublicKey) return;
    setBusy(true);
    try {
      await enableBrowserPush(draft.vapidPublicKey);
      await queryClient.invalidateQueries({ queryKey: ["notifications", "settings"] });
      toast.success("Web Push enabled for this browser");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not enable Web Push");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await saveNotificationSettings({ data: {
        pushMentions: false,
        pushNextMoves: false,
        pushPreview: draft.pushPreview,
        quietStart: draft.quietStart,
        quietEnd: draft.quietEnd,
        timeZone: draft.timeZone,
      } });
      await disableBrowserPush(false);
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Web Push disabled on all your devices");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disable Web Push");
    } finally {
      setBusy(false);
    }
  };

  const update = (values: Partial<Settings>) => setDraft((current) => current ? { ...current, ...values } : current);
  return (
    <div className="space-y-5 text-sm">
       <p className="text-muted-foreground">Choose how you hear about {instance.branding.socialName} mentions, comments on your posts and pending decisions. Web Push works when this site is closed, only after you enable it.</p>
       <p className="text-xs text-muted-foreground">In-app {instance.branding.socialName} alerts and Your next moves remain visible on your dashboard. These settings control optional Web Push only.</p>
      <div className="space-y-3 rounded-xl border p-4">
        <div><p className="font-medium">Web Push</p><p className="text-xs text-muted-foreground">Subscriptions are stored per browser. Disabling removes all your devices.</p></div>
        {(draft.pushMentions || draft.pushNextMoves) ? (
          <p>{draft.subscriptionCount} {draft.subscriptionCount === 1 ? "browser" : "browsers"} subscribed.</p>
        ) : null}
        {!draft.vapidPublicKey ? <p className="text-muted-foreground">Web Push has not been configured on this server.</p> :
          !canUseWebPush() ? <p className="text-muted-foreground">Web Push is unavailable in this browser or on this connection.</p> :
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => void enable()}>{draft.pushMentions || draft.pushNextMoves ? "Enable on this browser" : "Enable Web Push"}</Button>
            {(draft.pushMentions || draft.pushNextMoves) && <Button type="button" variant="outline" disabled={busy} onClick={() => void disable()}>Disable on all devices</Button>}
          </div>}
          <label className="flex items-center gap-3"><input type="checkbox" className="size-5 accent-primary" disabled={busy || !draft.subscriptionCount} checked={draft.pushMentions} onChange={(event) => update({ pushMentions: event.target.checked })} /> Web Push for {instance.branding.socialName} mentions and comments on your posts</label>
        <label className="flex items-center gap-3"><input type="checkbox" className="size-5 accent-primary" disabled={busy || !draft.subscriptionCount} checked={draft.pushNextMoves} onChange={(event) => update({ pushNextMoves: event.target.checked })} /> Web Push for Your next moves</label>
        {canUseWebPush() && Notification.permission === "denied" && <p className="text-xs text-muted-foreground">Notifications are blocked in browser settings. Change that permission before trying again.</p>}
      </div>
      <div className="flex items-center justify-between gap-3 rounded-xl border p-4">
        <div><Label htmlFor="push-preview">Show notification details on the lock screen</Label><p className="text-xs text-muted-foreground">Off by default. Opt in to show mention text or pending-action titles in push notifications.</p></div>
        <input id="push-preview" type="checkbox" className="size-5 accent-primary" checked={draft.pushPreview} onChange={(event) => update({ pushPreview: event.target.checked })} />
      </div>
      <div className="space-y-3 rounded-xl border p-4">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="quiet-hours">Quiet hours for Web Push</Label>
          <input id="quiet-hours" type="checkbox" className="size-5 accent-primary" checked={draft.quietStart !== null} onChange={(event) => update({ quietStart: event.target.checked ? 22 * 60 : null, quietEnd: event.target.checked ? 7 * 60 : null })} />
        </div>
        {draft.quietStart !== null && <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="quiet-start">From</Label><Input id="quiet-start" type="time" value={timeValue(draft.quietStart, "22:00")} onChange={(event) => update({ quietStart: minutes(event.target.value) })} /></div>
          <div className="space-y-1"><Label htmlFor="quiet-end">Until</Label><Input id="quiet-end" type="time" value={timeValue(draft.quietEnd, "07:00")} onChange={(event) => update({ quietEnd: minutes(event.target.value) })} /></div>
        </div>}
        <div className="space-y-1"><Label htmlFor="push-time-zone">Time zone (IANA)</Label><Input id="push-time-zone" value={draft.timeZone} onChange={(event) => update({ timeZone: event.target.value })} placeholder={Intl.DateTimeFormat().resolvedOptions().timeZone} maxLength={100} /></div>
          <p className="text-xs text-muted-foreground">Push messages during quiet hours are skipped, not queued for later. In-app {instance.branding.socialName} alerts remain available.</p>
      </div>
      <Button type="button" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save preferences"}</Button>
    </div>
  );
}
