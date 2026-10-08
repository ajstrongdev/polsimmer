import { Check, Palette, Pencil, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useAppTheme } from "@/components/app-theme-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/lib/auth-context";
import { instance } from "@/lib/instance-config";
import { colorSchemeInput, colorSchemeStyle } from "@/lib/color-schemes";
import {
  deleteColorScheme,
  getColorSchemeCatalog,
  saveColorScheme,
} from "@/lib/server/settings/color-schemes";
import { resetThemeServerFn, themeConfig, themes } from "@/lib/server/settings/theme";

type Catalog = Awaited<ReturnType<typeof getColorSchemeCatalog>>;
type SavedScheme =
  | Catalog["ownSchemes"][number]
  | Catalog["publicSchemes"][number];

const emptyDraft = {
  name: "",
  mode: "dark" as "dark" | "light",
  background: "#151525",
  foreground: "#f8f8fa",
  primary: "#9a80e9",
  accent: "#64d9bd",
  isPublished: false,
};

export function ModeToggle() {
  const { user } = useAuth();
  const { theme, customScheme, setTheme, chooseColorScheme } = useAppTheme();
  const [open, setOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [pageCursors, setPageCursors] = useState<Array<number | undefined>>([
    undefined,
  ]);
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const catalogRequest = useRef(0);

  const refreshCatalog = async (beforeId?: number) => {
    const request = ++catalogRequest.current;
    try {
      const result = await getColorSchemeCatalog({ data: { beforeId } });
      if (request === catalogRequest.current) setCatalog(result);
    } catch {
      if (request === catalogRequest.current)
        toast.error("Could not load shared themes");
    }
  };

  const choose = async (id: number) => {
    setBusy(true);
    try {
      await chooseColorScheme(id);
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not apply theme",
      );
    } finally {
      setBusy(false);
    }
  };

  const edit = (scheme?: SavedScheme) => {
    setDraft(
      scheme
        ? {
            name: scheme.name,
            mode: scheme.mode === "light" ? "light" : "dark",
            background: scheme.background,
            foreground: scheme.foreground,
            primary: scheme.primary,
            accent: scheme.accent,
            isPublished: scheme.isPublished,
          }
        : { ...emptyDraft },
    );
    setEditingId(scheme?.id ?? null);
    setOpen(false);
    setEditorOpen(true);
  };

  const save = async () => {
    const parsed = colorSchemeInput.safeParse(draft);
    if (!parsed.success) {
      toast.error(
        parsed.error.issues[0]?.message ?? "Check your theme colours",
      );
      return;
    }
    setBusy(true);
    try {
      const saved = await saveColorScheme({
        data: { id: editingId ?? undefined, scheme: parsed.data },
      });
      await chooseColorScheme(saved.id);
      setEditorOpen(false);
      setPage(0);
      setPageCursors([undefined]);
      await refreshCatalog();
      toast.success(
        draft.isPublished ? "Theme saved and shared" : "Private theme saved",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save theme",
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (scheme: SavedScheme) => {
    if (
      !window.confirm(
        `Delete “${scheme.name}”? Players using it will return to the default theme.`,
      )
    )
      return;
    setBusy(true);
    try {
      await deleteColorScheme({ data: { id: scheme.id } });
      if (customScheme?.id === scheme.id)
        setTheme(scheme.mode === "light" ? "light" : "dark");
      setPage(0);
      setPageCursors([undefined]);
      await refreshCatalog();
      toast.success("Theme deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete theme",
      );
    } finally {
      setBusy(false);
    }
  };

  const schemeRow = (scheme: SavedScheme, own: boolean) => (
    <div
      key={scheme.id}
      className="flex items-center gap-1 rounded-md hover:bg-accent/50"
    >
      <button
        type="button"
        disabled={!user || busy}
        onClick={() => void choose(scheme.id)}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm disabled:opacity-60"
        title={!user ? "Sign in to use a shared theme" : undefined}
      >
        <span
          className="size-4 shrink-0 rounded-full border"
          style={{ backgroundColor: scheme.primary }}
        />
        <span className="min-w-0 flex-1 truncate">
          {scheme.name}
          <span className="block truncate text-xs text-muted-foreground">
            {own
              ? scheme.isPublished
                ? "Shared"
                : "Private"
              : `by ${"ownerName" in scheme ? scheme.ownerName : "player"}`}
          </span>
        </span>
        {customScheme?.id === scheme.id && (
          <Check className="size-4 shrink-0" />
        )}
      </button>
      {own && (
        <>
          <Button
            size="icon"
            variant="ghost"
            disabled={busy}
            onClick={() => edit(scheme)}
            aria-label={`Edit ${scheme.name}`}
            title="Edit theme"
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            disabled={busy}
            onClick={() => void remove(scheme)}
            aria-label={`Delete ${scheme.name}`}
            title="Delete theme"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </>
      )}
    </div>
  );

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setPage(0);
            setPageCursors([undefined]);
            setCatalog(null);
            void refreshCatalog();
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 sm:size-9"
            aria-label="Choose theme"
            title="Choose theme"
          >
            <Palette className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="max-h-[70vh] w-72 overflow-y-auto p-2"
        >
          <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
            Choose a theme
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              await resetThemeServerFn();
              window.location.reload();
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            <span
              className="size-4 shrink-0 rounded-full border"
              style={{
                backgroundColor:
                  instance.theme.colors?.primary ??
                  themes.find((item) => item.id === themeConfig.defaultTheme)?.swatch,
              }}
            />
            <span className="flex-1 text-left">Default</span>
          </button>
          {themes
            .filter((t) => !instance.theme.colors || (t.id !== "light" && t.id !== "dark"))
            .map((t) => (
              <button
                type="button"
                key={t.id}
                disabled={busy}
                onClick={() => {
                  setTheme(t.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground ${theme === t.id && !customScheme ? "font-medium" : ""}`}
              >
                <span
                  className="size-4 shrink-0 rounded-full border"
                  style={{ backgroundColor: t.swatch }}
                />
                <span className="flex-1 text-left">{t.label}</span>
                {theme === t.id && !customScheme && <Check className="size-4" />}
              </button>
            ))}
          {user && (
            <>
              <div className="mt-2 border-t px-2 pt-2 text-xs font-semibold text-muted-foreground">
                My themes
              </div>
              {catalog?.ownSchemes.map((scheme) => schemeRow(scheme, true))}
              {catalog && !catalog.ownSchemes.length && (
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  No themes yet
                </p>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 w-full justify-start"
                onClick={() => edit()}
                disabled={busy || (catalog?.ownSchemes.length ?? 0) >= 8}
              >
                <Plus className="size-4" /> Create theme
              </Button>
            </>
          )}
          <div className="mt-2 border-t px-2 pt-2 text-xs font-semibold text-muted-foreground">
            Shared by players
          </div>
          {catalog?.publicSchemes
            .filter((scheme) => scheme.ownerId !== catalog.playerId)
            .map((scheme) => schemeRow(scheme, false))}
          {catalog &&
            !catalog.publicSchemes.some(
              (scheme) => scheme.ownerId !== catalog.playerId,
            ) &&
            page === 0 && (
              <p className="px-2 py-1 text-xs text-muted-foreground">
                No shared themes yet
              </p>
            )}
          {catalog && (page > 0 || catalog.hasMore) && (
            <div className="mt-1 flex justify-between border-t pt-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={page === 0}
                onClick={() => {
                  const previous = page - 1;
                  setPage(previous);
                  void refreshCatalog(pageCursors[previous]);
                }}
              >
                Previous
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!catalog.hasMore}
                onClick={() => {
                  const lastId = catalog.publicSchemes.at(-1)?.id;
                  if (!lastId) return;
                  setPageCursors([...pageCursors.slice(0, page + 1), lastId]);
                  setPage(page + 1);
                  void refreshCatalog(lastId);
                }}
              >
                Next
              </Button>
            </div>
          )}
          {!user && (
            <p className="px-2 py-1 text-xs text-muted-foreground">
              Sign in to create or use player themes.
            </p>
          )}
        </PopoverContent>
      </Popover>
      <Dialog
        open={editorOpen}
        onOpenChange={(next) => {
          if (!busy) setEditorOpen(next);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit theme" : "Create a theme"}
            </DialogTitle>
            <DialogDescription>
              Choose readable site colours. Only shared themes appear for other
              players.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className="block text-sm font-medium">
              Name
              <input
                className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                value={draft.name}
                maxLength={60}
                required
                minLength={2}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
              />
            </label>
            <label className="block text-sm font-medium">
              Base appearance
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                value={draft.mode}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    mode: event.target.value === "light" ? "light" : "dark",
                  })
                }
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {(["background", "foreground", "primary", "accent"] as const).map(
                (key) => (
                  <label
                    key={key}
                    className="flex items-center gap-2 text-sm capitalize"
                  >
                    <input
                      type="color"
                      className="size-9 cursor-pointer"
                      value={draft[key]}
                      onChange={(event) =>
                        setDraft({ ...draft, [key]: event.target.value })
                      }
                    />
                    {key === "foreground" ? "Text" : key}
                  </label>
                ),
              )}
            </div>
            <div
              className="rounded-md border p-3 text-sm"
              style={{
                backgroundColor: draft.background,
                color: draft.foreground,
              }}
            >
              Preview text{" "}
              <span
                className="ml-2 rounded px-2 py-1"
                style={{
                  backgroundColor: draft.primary,
                  color: colorSchemeStyle(draft)["--primary-foreground"],
                }}
              >
                Accent
              </span>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.isPublished}
                onChange={(event) =>
                  setDraft({ ...draft, isPublished: event.target.checked })
                }
              />
              Share with other players
            </label>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save and use theme"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
