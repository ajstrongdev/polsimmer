import { instance } from "@/lib/instance-config";
import { Link, useRouterState } from "@tanstack/react-router";
import { NavigationFooter, NavigationLinks } from "@/components/wiki/navigation-content";

export function DesktopNavigation() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname !== "/dashboard" && !pathname.startsWith("/dashboard/")) return null;

  return (
    <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col border-r bg-background lg:flex" aria-label="Game navigation">
      <Link to="/dashboard" className="block border-b px-5 py-5 pr-14 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring">
        <h2 className="font-serif text-xl font-semibold">{instance.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Navigate your political world</p>
      </Link>
      <NavigationLinks pathname={pathname} />
      <NavigationFooter />
    </aside>
  );
}
