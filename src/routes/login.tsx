import { instance } from "@/lib/instance-config";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useEffect, useState } from "react";
import { signIn } from "@/lib/auth-utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AuthIntro } from "@/components/auth/auth-intro";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      const { user, error } = await signIn(value);

      if (error) {
        form.setErrorMap({
          onSubmit: error,
        });
      } else if (user) {
        await navigate({ to: "/dashboard" });
      }
    },
  });

  return (
    <AuthIntro>
        <Card className="w-full space-y-6 rounded-sm p-5 shadow-sm sm:p-7">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-bold">Sign In</h1>
            <p className="text-muted-foreground">
              Enter your email and password to sign in.
            </p>
          </div>

          <form
            method="post"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
            className="space-y-4"
          >
            {form.state.errorMap.onSubmit && (
              <div role="alert" className="rounded-sm border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {form.state.errorMap.onSubmit}
              </div>
            )}

            <form.Field name="email">
              {(field) => (
                <div className="space-y-2">
                  <label htmlFor={field.name} className="text-sm font-medium">
                    Email
                  </label>
                   <Input
                    id={field.name}
                    name={field.name}
                     type="email"
                     autoComplete="email"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    required
                     className="h-11"
                    placeholder="you@example.com"
                  />
                </div>
              )}
            </form.Field>

            <form.Field name="password">
              {(field) => (
                <div className="space-y-2">
                  <label htmlFor={field.name} className="text-sm font-medium">
                    Password
                  </label>
                   <Input
                    id={field.name}
                    name={field.name}
                     type="password"
                     autoComplete="current-password"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    required
                     className="h-11"
                    placeholder="••••••••"
                  />
                </div>
              )}
            </form.Field>

            <form.Subscribe selector={(state) => [state.isSubmitting]}>
              {([isSubmitting]) => (
                <Button
                  type="submit"
                   className="h-11 w-full"
                  disabled={isSubmitting || !hydrated}
                >
                  {isSubmitting ? "Signing in..." : "Sign In"}
                </Button>
              )}
            </form.Subscribe>
          </form>
        </Card>
        <p className="text-center text-sm text-muted-foreground">
           Don't have an account? Ask a player for an invite link to sign up
           {instance.social.community && <>, or ask in the {instance.name}{" "}
          <a
             href={instance.social.community}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
          >
            Discord
          </a>
           .</>}
        </p>
    </AuthIntro>
  );
}
