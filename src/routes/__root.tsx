import { instance } from "@/lib/instance-config";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
  redirect,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { Toaster } from "sonner";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import appCss from "../styles.css?url";
import packageJson from "../../package.json";
import type { QueryClient } from "@tanstack/react-query";
import type { User } from "firebase/auth";
import { getThemeClasses, getThemeServerFn, themes } from "@/lib/server/settings/theme";
import { NotFound } from "@/components/not-found";
import { WikiNavigation } from "@/components/wiki/wiki-header";
import { DesktopNavigation } from "@/components/wiki/desktop-navigation";
import { MobileGameNavigation } from "@/components/wiki/mobile-navigation";
import { getAuthRedirect } from "@/lib/auth-guard";
import { auth } from "@/lib/firebase";
import { getCurrentBanStatus, getSessionUser } from "@/lib/server/auth/session";
import { AppThemeProvider, useAppTheme } from "@/components/app-theme-provider";
import { colorSchemeStyle } from "@/lib/color-schemes";
import { getSelectedColorScheme } from "@/lib/server/settings/color-schemes";
import { PlayerPresenceHeartbeat } from "@/components/players/player-presence-heartbeat";
import { LiveUpdates } from "@/components/notifications/live-updates";

const commitSha = import.meta.env.VITE_COMMIT_SHA;
const sourceUrl = "https://github.com/ajstrongdev/polsimmer";

type AuthContext = {
  user: User | null;
  loading: boolean;
};

interface MyRouterContext {
  queryClient: QueryClient;
  auth: AuthContext;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  beforeLoad: async ({ location, context }) => {
    const { banned } = await getCurrentBanStatus();
    if (banned && location.pathname !== "/banned") {
      throw redirect({ to: "/banned" });
    }
    const authUser =
      context.auth?.user ??
      (typeof window !== "undefined" ? (auth.currentUser ?? null) : null);
    const sessionUser = authUser ? null : await getSessionUser();
    const hasSessionCookie = Boolean(sessionUser);
    const isLoading = context.auth?.loading && !authUser && !hasSessionCookie;

    if (isLoading) {
      return;
    }

    const pathname = location.pathname;
    const redirectTarget = getAuthRedirect(
      pathname,
      Boolean(authUser || sessionUser),
      false,
      hasSessionCookie,
    );

    if (redirectTarget) {
      throw redirect({ to: redirectTarget });
    }
  },
  loader: async () => {
    const [savedTheme, selectedScheme] = await Promise.all([
      getThemeServerFn(),
      getSelectedColorScheme(),
    ]);
    const customScheme = selectedScheme ?? (!savedTheme.hasPreference && instance.theme.colors
      ? { id: -1, name: "Instance default", ...instance.theme.colors }
      : null);
    const theme = customScheme
      ? customScheme.mode === "dark"
        ? "dark"
        : "light"
      : savedTheme.theme;
    return { theme, customScheme };
  },
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: instance.name,
      },
      { name: "description", content: instance.description },
      { property: "og:site_name", content: instance.name },
      { property: "og:url", content: instance.domain },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        href: instance.branding.icon,
      },
      {
        rel: "apple-touch-icon",
        href: instance.branding.logo,
      },
    ],
  }),

  shellComponent: RootDocument,
  component: RootLayout,
  notFoundComponent: NotFound,
});

function RootLayout() {
  const { theme, customScheme } = Route.useLoaderData();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const gameScreen = pathname === "/dashboard" || pathname.startsWith("/dashboard/");

  return (
    <AppThemeProvider initialTheme={theme} initialColorScheme={customScheme}>
      <PlayerPresenceHeartbeat />
      <LiveUpdates />
      <div className="flex min-h-svh min-w-0 flex-col">
        <WikiNavigation />
        {gameScreen && <MobileGameNavigation />}
        <div className="flex min-w-0 flex-1 items-stretch">
          <DesktopNavigation />
          <div className={`flex min-w-0 flex-1 flex-col ${gameScreen ? "pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0" : ""}`}>
            <Outlet />
            <footer className="mt-auto border-t bg-muted/30 px-4 py-4 text-center text-sm text-muted-foreground">
              Running Polsimmer v{packageJson.version}{" "}
               <a href={commitSha ? `${sourceUrl}/commit/${commitSha}` : sourceUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">(source{commitSha ? ` - ${commitSha.slice(0, 7)}` : ""})</a>
              {" "}·{" "}
              <Link to="/changelog" className="font-medium text-primary hover:underline">Changelog</Link>
              {" "}·{" "}
               {"·"} <a href="https://discord.gg/XREYCNFAdC" target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">Join the Polsimmer Discord</a>
               {" "}·{" "}
               <a href="https://ko-fi.com/polsimmer" target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">Buy me a Coffee</a>
            </footer>
          </div>
        </div>
        <ThemedToaster />
      </div>
    </AppThemeProvider>
  );
}

function ThemedToaster() {
  const { theme, customScheme } = useAppTheme();
  return (
    <Toaster
      position="bottom-right"
      theme={
        customScheme
          ? customScheme.mode === "dark"
            ? "dark"
            : "light"
          : themes.find((item) => item.id === theme)?.isDark
            ? "dark"
            : "light"
      }
      richColors
    />
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const { theme, customScheme } = Route.useLoaderData();
  return (
    <html
      lang={instance.locale}
      className={getThemeClasses(theme)}
      style={
        customScheme
          ? (colorSchemeStyle(customScheme) as React.CSSProperties)
          : undefined
      }
      suppressHydrationWarning
    >
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
            TanStackQueryDevtools,
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}
