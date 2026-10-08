import { instance } from "@/lib/instance-config";
import { Fragment, useEffect, useRef, useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { ArrowRight, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { dashboardComposeEvent } from "@/lib/dashboard-commands";

const commands = [
  {
    to: "/dashboard",
    command: "bill",
    label: "Draft a bill",
    description: "Submit a new proposal",
    group: "Create",
    keywords: "write legislation propose",
  },
  {
    to: "/dashboard",
    command: "post",
     label: `Create a ${instance.branding.socialName} post`,
    description: `Share an update with ${instance.name}`,
    group: "Create",
    keywords: "social publish message",
  },
] as const;

const destinations = [
  {
    to: "/dashboard",
    label: "Dashboard",
    description: "Your next moves and notifications",
    group: "Start",
    keywords: "home actions notifications",
  },
  {
    to: "/dashboard/bills",
    label: "Bills",
    description: "Read proposals and chamber voting",
    group: "Play",
    keywords: "legislation vote senate house",
  },
  {
    to: "/dashboard/elections",
    label: "Elections",
    description: "Current races and past results",
    group: "Play",
    keywords: "ballot candidate president senate results",
  },
  {
    to: "/dashboard/parties/primaries",
    label: "Presidential primaries",
    description: "Nominations and primary voting",
    group: "Play",
    keywords: "stand nominate party candidate",
  },
  {
    to: "/dashboard/parties",
    label: "Parties",
    description: "Find or manage a party",
    group: "Community",
    keywords: "join create coalition",
  },
  {
    to: "/dashboard/social",
     label: instance.branding.socialName,
    description: "Posts and conversations",
    group: "Community",
    keywords: "social post reply discussion",
  },
  {
    to: "/dashboard/players",
    label: "Players",
    description: "People and profiles",
    group: "Community",
    keywords: "search find users profile",
  },
  {
    to: "/dashboard/nation",
    label: "Nation",
    description: `${instance.name}'s current state`,
    group: "Records",
    keywords: "economy civil rights freedoms",
  },
  {
    to: "/dashboard/government",
    label: "Government history",
    description: "Past officeholders and composition",
    group: "Records",
    keywords: "archive seats representatives",
  },
  {
    to: "/dashboard/guide",
    label: "Player guide",
    description: "Learn how to play",
    group: "Help",
    keywords: "tutorial rules help",
  },
  {
    to: instance.social.community ?? "/dashboard",
    label: `${instance.name} Discord`,
    description: `Join the ${instance.name} game community on Discord`,
    group: "Community",
    keywords: "discord chat community join server",
  },
] as const;

export function QuickNavigation({ keyboardShortcut = true, iconOnly = false }: { keyboardShortcut?: boolean; iconOnly?: boolean } = {}) {
  const router = useRouter();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const optionRefs = useRef<
    Array<HTMLAnchorElement | HTMLButtonElement | null>
  >([]);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = [
    ...destinations.slice(0, 1),
    ...(user ? commands.filter((item) => instance.features.social || item.command !== "post") : []),
    ...destinations.slice(1).filter((item) =>
      (item.label !== `${instance.name} Discord` || instance.social.community) &&
      (instance.features.social || item.to !== "/dashboard/social")),
  ].filter((item) =>
    terms.every((term) =>
      `${item.label} ${item.description} ${item.group} ${item.keywords}`
        .toLowerCase()
        .includes(term),
    ),
  );
  const resultCount = matches.length;

  useEffect(() => {
    if (!keyboardShortcut) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [keyboardShortcut]);

  const close = () => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  };
  const openComposer = async (command: "bill" | "post") => {
    close();
    try {
      await router.navigate({ to: "/dashboard" });
      window.requestAnimationFrame(() => {
        const handled = new Event(dashboardComposeEvent[command], {
          cancelable: true,
        });
        if (window.dispatchEvent(handled))
          toast.error("This action is available to active players only.");
      });
    } catch {
      toast.error("Could not open the dashboard. Please try again.");
    }
  };
  const handleSearchKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!resultCount) return;
      const next =
        (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + resultCount) %
        resultCount;
      setActiveIndex(next);
      optionRefs.current[next]?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && resultCount) {
      event.preventDefault();
      optionRefs.current[Math.min(activeIndex, resultCount - 1)]?.click();
    } else if (event.key === "Home" && resultCount) {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End" && resultCount) {
      event.preventDefault();
      setActiveIndex(resultCount - 1);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={iconOnly ? "size-11 px-0" : "h-11 min-w-11 px-0 sm:h-8 sm:min-w-0 sm:px-3"}
        onClick={() => setOpen(true)}
        aria-label="Open command palette"
        title="Search destinations (Ctrl/Cmd+K)"
      >
        <Search className="size-4" />{" "}
        <span className={iconOnly ? "sr-only" : "hidden sm:inline"}>Search</span>
        <kbd className={iconOnly ? "hidden" : "ml-1 hidden rounded border px-1 text-[10px] text-muted-foreground lg:inline"}>
          Ctrl/⌘ K
        </kbd>
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (next) setOpen(true);
          else close();
        }}
      >
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="border-b px-5 pb-4 pt-5 pr-12">
            <DialogTitle className="font-serif text-xl">
              Where do you want to go?
            </DialogTitle>
            <DialogDescription>
              Search tools, topics, and destinations across {instance.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="relative border-b px-4 py-3">
            <Search className="absolute left-7 top-5 size-4 text-muted-foreground" />
            <Input
              autoFocus
              role="combobox"
              aria-controls="quick-nav-options"
              aria-expanded={open}
              aria-autocomplete="list"
              aria-activedescendant={
                resultCount
                  ? `quick-nav-option-${Math.min(activeIndex, resultCount - 1)}`
                  : undefined
              }
              className="border-0 pl-9 shadow-none focus-visible:ring-0"
              placeholder="Try ‘vote’, ‘party’, or ‘history’"
              aria-label="Search destinations"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleSearchKey}
            />
          </div>
          <div
            id="quick-nav-options"
            role="listbox"
            aria-label="Destinations"
            className="max-h-[min(24rem,55dvh)] overflow-y-auto px-2 py-2"
          >
            {matches.map((item, index) => (
              <Fragment key={item.to}>
                {(index === 0 || matches[index - 1].group !== item.group) && (
                  <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground first:pt-1">
                    {item.group}
                  </p>
                )}
                {item.to.startsWith("https://") ? (
                <a
                  id={`quick-nav-option-${index}`}
                  role="option"
                  aria-selected={activeIndex === index}
                  href={item.to}
                  target="_blank"
                  rel="noopener noreferrer"
                  ref={(node) => { optionRefs.current[index] = node; }}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => close()}
                  className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm outline-none hover:bg-muted focus-visible:bg-muted aria-selected:bg-muted"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{item.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </a>
                ) : <Link
                  id={`quick-nav-option-${index}`}
                  ref={(node) => { optionRefs.current[index] = node; }}
                  role="option"
                  aria-selected={activeIndex === index}
                  to={item.to as any}
                  search={item.to === "/dashboard/social" ? ({ postId: undefined, commentId: undefined } as any) : undefined}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={(event) => {
                    if ("command" in item && item.command) { event.preventDefault(); void openComposer(item.command); } else close();
                  }}
                  className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm outline-none hover:bg-muted focus-visible:bg-muted aria-selected:bg-muted"
                >
                  <span className="min-w-0 flex-1"><span className="block font-semibold">{item.label}</span><span className="block truncate text-xs text-muted-foreground">{item.description}</span></span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>}
              </Fragment>
            ))}
            {!resultCount && (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                No matching destinations. Try a different word.
              </p>
            )}
          </div>
          <div className="flex items-center gap-4 border-t px-5 py-2 text-xs text-muted-foreground">
            <span>↑ ↓ Select</span>
            <span>↵ Open</span>
            <span>Esc Close</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
