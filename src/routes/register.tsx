import { Link, createFileRoute } from "@tanstack/react-router";
import { SignupForm } from "@/components/auth/signup-form";
import { AuthIntro } from "@/components/auth/auth-intro";
import { validateInvitation } from "@/lib/server/users/invitations";

export const Route = createFileRoute("/register")({
  validateSearch: (search: Record<string, unknown>) => ({
    invite: typeof search.invite === "string" ? search.invite : undefined,
  }),
  loaderDeps: ({ search }) => ({ invite: search.invite }),
  loader: async ({ deps }) => {
    if (!deps.invite) return { validInvite: false };
    try {
      await validateInvitation({ data: { token: deps.invite } });
      return { validInvite: true };
    } catch {
      return { validInvite: false };
    }
  },
  component: RegisterPage,
});

function RegisterPage() {
  const { invite } = Route.useSearch();
  const { validInvite } = Route.useLoaderData();

  return (
    <AuthIntro>
        {validInvite && invite ? (
          <SignupForm key={invite} inviteToken={invite} />
        ) : (
          <div className="rounded-lg border bg-card p-6 text-center space-y-2">
            <h1 className="text-2xl font-bold">Invite link required</h1>
            <p className="text-muted-foreground">
              This invite link is missing, invalid, expired, or already used.
              Ask an existing player for a new link to sign up.
            </p>
          </div>
        )}
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
    </AuthIntro>
  );
}
