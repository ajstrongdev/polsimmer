import { instance } from "@/lib/instance-config";
import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  Eye,
  FileText,
  MessageSquareText,
  Search,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { MarkdownContent } from "@/components/wiki/markdown-content";
import { MarkdownToolbar } from "@/components/markdown-toolbar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { billCommentPostContent } from "@/lib/bill-comment-post";
import { dashboardComposeEvent } from "@/lib/dashboard-commands";
import { searchDiscussionBills } from "@/lib/server/bills/bill-comments";
import { createSocialPost } from "@/lib/server/social/social";

type BillOption = Awaited<ReturnType<typeof searchDiscussionBills>>[number];
type Identity = "player" | "party" | "potro";

export function DashboardSocialPostDialog({
  user,
}: {
  user: {
    id: number;
    username: string;
    role: string | null;
    active: boolean | null;
    partyId: number | null;
    partyName: string | null;
    partySocialMediaOfficerId: number | null;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [postAs, setPostAs] = useState<Identity>("player");
  const [billPickerOpen, setBillPickerOpen] = useState(false);
  const [billQuery, setBillQuery] = useState("");
  const [billOptions, setBillOptions] = useState<Array<BillOption>>([]);
  const [searching, setSearching] = useState(false);
  const [selectedBill, setSelectedBill] = useState<BillOption | null>(null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const openComposer = (event: Event) => {
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener(dashboardComposeEvent.post, openComposer);
    return () =>
      window.removeEventListener(dashboardComposeEvent.post, openComposer);
  }, []);

  useEffect(() => {
    if (!billPickerOpen) return;
    let active = true;
    setSearching(true);
    const timeout = window.setTimeout(() => {
      searchDiscussionBills({ data: { query: billQuery } })
        .then((results) => {
          if (active) setBillOptions(results);
        })
        .catch(() => {
          if (active) setBillOptions([]);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [billPickerOpen, billQuery]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!content.trim() || busy) return;
    setBusy(true);
    try {
      await createSocialPost({
        data: {
          content,
          accountKey: postAs,
          ...(postAs === "party" && user.partyId
            ? { partyId: user.partyId }
            : {}),
          ...(selectedBill ? { billId: selectedBill.id } : {}),
        },
      });
      setContent("");
      setSelectedBill(null);
      setPreview(false);
      setOpen(false);
      await router.invalidate();
      toast.success(`Post published to ${instance.branding.socialName}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not publish post",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="group flex min-h-[4.5rem] min-w-0 items-center gap-3 rounded-lg border bg-card px-3 py-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/30 sm:px-4"
        >
          <MessageSquareText className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
          <span className="min-w-0 flex-1">
             <span className="block font-semibold">Create a {instance.branding.socialName} post</span>
            <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
              Share an update or discuss a bill.
            </span>
          </span>
          <Send className="size-4 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100 group-hover:text-primary" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
             Create a {instance.branding.socialName} post
          </DialogTitle>
          <DialogDescription>
            Publish as yourself, or an account you manage.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Textarea
            id="dashboard-social-post"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            maxLength={280}
            required
            rows={5}
            placeholder={`What's happening, @${user.username}?`}
            aria-label="Post content"
          />
          <div className="flex flex-wrap items-center gap-2">
            {postAs === "player" && (
              <Popover open={billPickerOpen} onOpenChange={setBillPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    variant={selectedBill ? "secondary" : "outline"}
                  >
                    <FileText className="size-4" />{" "}
                    {selectedBill
                      ? `Bill #${selectedBill.id}: ${selectedBill.title}`
                      : "Attach a bill"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-[min(22rem,calc(100vw-2rem))] p-2"
                >
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                    <input
                      value={billQuery}
                      onChange={(event) => setBillQuery(event.target.value)}
                      placeholder="Search bills"
                      aria-label="Search bills"
                      maxLength={100}
                      className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm"
                    />
                  </div>
                  <div className="mt-2 max-h-60 overflow-y-auto">
                    {searching ? (
                      <p className="p-2 text-sm text-muted-foreground">
                        Searching…
                      </p>
                    ) : billOptions.length ? (
                      billOptions.map((bill) => (
                        <button
                          key={bill.id}
                          type="button"
                          onClick={() => {
                            setSelectedBill(bill);
                            setBillPickerOpen(false);
                          }}
                          className="block w-full rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                        >
                          #{bill.id} {bill.title}
                        </button>
                      ))
                    ) : (
                      <p className="p-2 text-sm text-muted-foreground">
                        No bills found.
                      </p>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            )}
            {selectedBill && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove bill"
                onClick={() => setSelectedBill(null)}
              >
                <X className="size-4" />
              </Button>
            )}
            <MarkdownToolbar
              textareaId="dashboard-social-post"
              value={content}
              onChange={setContent}
            />
            {content.trim() && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPreview((value) => !value)}
              >
                <Eye className="size-4" />{" "}
                {preview ? "Hide preview" : "Preview"}
              </Button>
            )}
          </div>
          {selectedBill && (
            <p className="text-xs text-muted-foreground">
              This post also appears in Bill #{selectedBill.id}’s discussion.
            </p>
          )}
          {preview && content.trim() && (
            <div className="rounded-lg border bg-muted/20 p-3">
              <MarkdownContent
                content={
                  selectedBill
                    ? billCommentPostContent(selectedBill.id, content)
                    : content
                }
                compact
              />
            </div>
          )}
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-muted-foreground">
              Post as
            </legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: "player", label: `@${user.username}` },
                  ...(user.partyId && user.partySocialMediaOfficerId === user.id
                    ? [{ key: "party", label: user.partyName ?? "Party" }]
                    : []),
                  ...(user.role === "President" && user.active
                    ? [{ key: "potro", label: "POTRO" }]
                    : []),
                ] as Array<{ key: Identity; label: string }>
              ).map((identity) => (
                <Button
                  key={identity.key}
                  type="button"
                  size="sm"
                  variant={postAs === identity.key ? "default" : "outline"}
                  aria-pressed={postAs === identity.key}
                  onClick={() => {
                    setPostAs(identity.key);
                    setSelectedBill(null);
                    setBillPickerOpen(false);
                  }}
                >
                  {identity.label}
                </Button>
              ))}
            </div>
          </fieldset>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Markdown and references supported</span>
            <span className="font-mono">{content.length}/280</span>
          </div>
          <Button
            type="submit"
            disabled={busy || !content.trim()}
            className="w-full"
          >
            <Send className="size-4" /> {busy ? "Posting…" : "Publish post"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
