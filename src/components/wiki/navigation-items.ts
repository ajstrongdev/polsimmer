import { instance } from "@/lib/instance-config";
import {
  BookOpen,
  Flag,
  History,
  Home,
  Landmark,
  MessageSquareText,
  ScrollText,
  UserRound,
  UsersRound,
  Vote,
} from "lucide-react";

// Every destination belongs to the game. Keep one order and one icon family
// across the permanent desktop sidebar and the small-screen drawer.
export const navigationItems = [
  { label: "Dashboard", to: "/dashboard", icon: Home },
  { label: "Bills & voting", to: "/dashboard/bills", icon: ScrollText },
  { label: "Elections", to: "/dashboard/elections", icon: Vote },
  { label: "Parties", to: "/dashboard/parties", icon: UsersRound },
  { label: "Presidential primaries", to: "/dashboard/parties/primaries", icon: Landmark },
  { label: instance.branding.socialName, to: "/dashboard/social", icon: MessageSquareText },
  { label: "Players", to: "/dashboard/players", icon: UserRound },
  { label: "Nation", to: "/dashboard/nation", icon: Flag },
  { label: "Government history", to: "/dashboard/government", icon: History },
  { label: "Player guide", to: "/dashboard/guide", icon: BookOpen },
] as const;

export const navigationGroups = [
  { label: "Political activity", items: navigationItems.slice(0, 5) },
  { label: "People & news", items: navigationItems.slice(5, 7).filter((item) => instance.features.social || item.to !== "/dashboard/social") },
  { label: "Nation & reference", items: navigationItems.slice(7) },
] as const;

export const mobilePrimaryItems = [
  { ...navigationItems[0], shortLabel: "Home" },
  { ...navigationItems[1], shortLabel: "Bills" },
  ...(instance.features.social ? [{ ...navigationItems[5], shortLabel: instance.branding.socialName }] : []),
] as const;

export const mobileDrawerGroups = navigationGroups
  .map((group) => ({
    label: group.label,
    items: group.items.filter((item) =>
      !mobilePrimaryItems.some((primary) => primary.to === item.to),
    ),
  }))
  .filter((group) => group.items.length > 0);

export function isActiveDestination(pathname: string, to: string) {
  if (to === "/dashboard") return pathname === to || pathname === `${to}/`;
  return (pathname === to || pathname.startsWith(`${to}/`)) &&
    !(to === "/dashboard/parties" && pathname.startsWith("/dashboard/parties/primaries"));
}
