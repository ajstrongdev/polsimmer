import { createFileRoute, redirect } from "@tanstack/react-router";
import { getCurrentUserInfo } from "@/lib/server/users/users";

export const Route = createFileRoute("/")({
  loader: async () => {
    throw redirect({ to: (await getCurrentUserInfo()) ? "/dashboard" : "/login" });
  },
});
