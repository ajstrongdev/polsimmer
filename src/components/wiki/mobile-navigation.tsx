import { instance } from "@/lib/instance-config";
import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NavigationFooter, NavigationLinks } from "@/components/wiki/navigation-content";
import { isActiveDestination, mobileDrawerGroups, mobilePrimaryItems } from "@/components/wiki/navigation-items";

export function MobileGameNavigation() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <nav aria-label="Primary navigation" className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-stretch border-t bg-background/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgb(0_0_0_/_0.06)] backdrop-blur lg:hidden">
      {mobilePrimaryItems.map(({ to, icon: Icon, shortLabel }) => {
        const active = isActiveDestination(pathname, to);
        return (
          <Link
            key={to}
            to={to}
            search={to === "/dashboard/social" ? { postId: undefined, commentId: undefined } : undefined}
            aria-current={active ? "page" : undefined}
            className={`group flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${active ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <span className={`flex h-8 w-9 items-center justify-center rounded-xl transition-colors ${active ? "bg-primary/10" : "group-hover:bg-muted"}`}>
              <Icon className="size-5 shrink-0" aria-hidden="true" />
            </span>
            <span className="truncate">{shortLabel}</span>
          </Link>
        );
      })}
      <MobileNavigation bottomBar />
    </nav>
  );
}

export function MobileNavigation({ bottomBar = false }: { bottomBar?: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const moreActive = mobileDrawerGroups.some((group) =>
    group.items.some((item) => isActiveDestination(pathname, item.to)),
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={bottomBar
            ? `group h-full min-w-0 flex-1 flex-col gap-0.5 rounded-lg border-0 bg-transparent px-0 text-[11px] font-medium shadow-none hover:bg-transparent dark:hover:bg-transparent ${moreActive ? "text-primary" : "text-muted-foreground hover:text-foreground"}`
            : "h-11 gap-2 px-2 sm:h-9 sm:px-3"}
          aria-label="Open navigation"
          aria-expanded={open}
          title="Open navigation"
        >
          {bottomBar ? (
            <span className={`flex h-8 w-9 items-center justify-center rounded-xl transition-colors ${moreActive ? "bg-primary/10" : "group-hover:bg-muted"}`}>
              <Menu className="size-5" aria-hidden="true" />
            </span>
          ) : <Menu className="size-5" aria-hidden="true" />}
          <span className={bottomBar ? "truncate" : "hidden md:inline"}>{bottomBar ? "More" : "Menu"}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(21rem,calc(100vw-2rem))] gap-0 overflow-hidden p-0 motion-reduce:animate-none">
        <SheetHeader className="border-b p-0 text-left">
          <Link to="/dashboard" onClick={() => setOpen(false)} className="block px-5 py-5 pr-14 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring">
            <SheetTitle className="font-serif text-xl">{instance.name}</SheetTitle>
            <SheetDescription className="mt-1">Navigate your political world</SheetDescription>
          </Link>
        </SheetHeader>
        <NavigationLinks pathname={pathname} onNavigate={() => setOpen(false)} mobile={bottomBar} />
        <NavigationFooter />
      </SheetContent>
    </Sheet>
  );
}
