import { instance } from "@/lib/instance-config";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AccountSettingsDialog } from "@/components/settings/account-settings-dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { canUseWebPush, enableBrowserPush } from "@/lib/notifications/browser-push";
import { getNotificationSettings } from "@/lib/server/notifications/preferences";

const reminderMs = 30 * 24 * 60 * 60 * 1000;

export function NotificationInvite({ active }: { active: boolean }) {
  const { user, sessionReady } = useAuth();
  const queryClient = useQueryClient();
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPublicKey(null);
    if (!instance.features.browserNotifications || !active || !user || !sessionReady || !canUseWebPush() || Notification.permission !== "default") return;
    const reminderKey = `${instance.id}:push-invite:${user.uid}`;
    const lastDismissed = Number(localStorage.getItem(reminderKey) ?? "0");
    if (Date.now() - lastDismissed < reminderMs) return;
    let current = true;
    void getNotificationSettings().then((settings) => {
      if (current && !settings.pushMentions && !settings.pushNextMoves && settings.vapidPublicKey) setPublicKey(settings.vapidPublicKey);
    }).catch(() => { /* Never block login for a notification invitation. */ });
    return () => { current = false; };
  }, [active, user?.uid, sessionReady]);

   if (!instance.features.browserNotifications || !active || !publicKey || !user) return null;
  const dismiss = () => {
    localStorage.setItem(`${instance.id}:push-invite:${user.uid}`, String(Date.now()));
    setPublicKey(null);
  };
  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      await enableBrowserPush(publicKey);
      await queryClient.invalidateQueries({ queryKey: ["notifications", "settings"] });
      dismiss();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not enable notifications");
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside aria-label="Notification invitation" className="fixed bottom-4 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] space-y-3 rounded-xl border bg-card p-4 shadow-lg">
        <p className="font-semibold">Stay up to date on {instance.branding.socialName}?</p>
       <p className="text-sm text-muted-foreground">Enable browser notifications for mentions, comments on your posts and Your next moves when {instance.name} is closed. You can change this any time.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => void enable()}>Enable notifications</Button>
        <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>Preferences</Button>
        <Button size="sm" variant="ghost" onClick={dismiss}>Not now</Button>
      </div>
      <AccountSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} initialTab="notifications" />
    </aside>
  );
}
