import { instance } from "@/lib/instance-config";
import { Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { WikiEmpty, WikiSection } from "@/components/wiki/wiki-layout";
import { MarkdownContent } from "@/components/wiki/markdown-content";

dayjs.extend(relativeTime);

type PartySocialPost = {
  id: number;
  content: string;
  createdAt: Date;
  publisherUserId: number | null;
  publisherUsername: string;
};

export function SocialPartyPosts({ posts }: { posts: Array<PartySocialPost> }) {
  return (
    <WikiSection title={`${instance.branding.socialName} account`} description="Posts published from this party’s official account.">
      {posts.length ? (
        <div className="divide-y border-y">
          {posts.map((post) => (
            <article key={post.id} className="min-w-0 space-y-3 px-4 py-4 hover:bg-muted/20">
                <div className="wrap-break-word text-sm leading-6"><MarkdownContent content={post.content} compact /></div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    Posted by {post.publisherUserId ? (
                      <Link
                        to="/dashboard/players/$playerId"
                        params={{ playerId: String(post.publisherUserId) }}
                        className="hover:text-primary hover:underline"
                      >
                        @{post.publisherUsername}
                      </Link>
                    ) : `@${post.publisherUsername}`}
                  </span>
                  <Link to="/dashboard/social" search={{ postId: post.id, commentId: undefined }} className="font-medium text-primary hover:underline"><time dateTime={new Date(post.createdAt).toISOString()}>{dayjs(post.createdAt).fromNow()}</time> · View conversation</Link>
                </div>
            </article>
          ))}
        </div>
      ) : (
         <WikiEmpty>This party has not posted from its {instance.branding.socialName} account yet.</WikiEmpty>
      )}
    </WikiSection>
  );
}
