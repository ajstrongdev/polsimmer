import { instance } from "@/lib/instance-config";
import { Link } from "@tanstack/react-router";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { WikiEmpty, WikiSection } from "@/components/wiki/wiki-layout";
import { MarkdownContent } from "@/components/wiki/markdown-content";

dayjs.extend(relativeTime);

export type PlayerSocialPost = {
  id: number;
  content: string;
  createdAt: Date;
};

export function SocialPlayerPosts({ posts }: { posts: Array<PlayerSocialPost> }) {
  return (
    <WikiSection title={`${instance.branding.socialName} posts`} description="Recent posts shared from this player’s account.">
      {posts.length ? (
        <div className="divide-y border-y">
          {posts.map((post) => (
            <article key={post.id} className="min-w-0 space-y-3 px-4 py-4 hover:bg-muted/20">
              <div className="wrap-break-word text-sm leading-6"><MarkdownContent content={post.content} compact /></div>
              <Link to="/dashboard/social" search={{ postId: post.id, commentId: undefined }} className="inline-block text-xs font-medium text-primary hover:underline" aria-label={`Open post from ${dayjs(post.createdAt).fromNow()}`}>
                <time dateTime={new Date(post.createdAt).toISOString()}>{dayjs(post.createdAt).fromNow()}</time> · View conversation
              </Link>
            </article>
          ))}
        </div>
      ) : (
         <WikiEmpty>No {instance.branding.socialName} posts yet.</WikiEmpty>
      )}
    </WikiSection>
  );
}
