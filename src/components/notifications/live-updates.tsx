import { instance } from "@/lib/instance-config";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

export const socialChangeEvent = `${instance.id}:social-change`;

export function LiveUpdates() {
  const { user, sessionReady } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    const refresh = (social = false) => {
      if (document.visibilityState !== "visible") return;
      void router.invalidate();
      void queryClient.invalidateQueries();
      if (social) {
        window.dispatchEvent(new Event(socialChangeEvent));
      }
    };
    if (!sessionReady) {
      const fallback = window.setInterval(() => refresh(), 10_000);
      return () => window.clearInterval(fallback);
    }
    const stream = new EventSource("/api/live");
    stream.addEventListener("change", (event) => {
      if (
        event.data === "social" ||
        event.data === "dashboard" ||
        event.data === "game"
      )
        refresh(event.data === "social");
    });
    stream.addEventListener("ready", () => {
      refresh();
    });
    stream.onopen = () => {
      refresh();
    };
    // Poll active route loaders and queries even while SSE is connected. This
    // covers legacy write paths without database change triggers and acts as a
    // bounded recovery path if a notification is missed.
    const fallback = window.setInterval(() => refresh(), 10_000);
    const onReturn = () => refresh();
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("online", onReturn);
    return () => {
      stream.close();
      window.clearInterval(fallback);
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("online", onReturn);
    };
  }, [user?.uid, sessionReady, queryClient, router]);

  return null;
}
