import { instance } from "@/lib/instance-config";
import type { ReactNode } from "react";

export function AuthIntro({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-10 sm:py-16">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 top-10 h-80 w-80 rounded-full bg-green-400/15 blur-3xl dark:bg-green-400/10" />
        <div className="absolute -right-24 bottom-10 h-96 w-96 rounded-full bg-blue-400/15 blur-3xl dark:bg-blue-400/10" />
        <div className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
      </div>
      <div className="relative grid w-full max-w-5xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="space-y-6 text-center lg:text-left">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">{instance.nationName}</p>
          <h1 className="font-serif text-4xl font-bold tracking-tight sm:text-5xl">Welcome to {instance.name}</h1>
          <p className="text-lg leading-relaxed text-muted-foreground">{instance.description}</p>
          <div className="space-y-3 border-t pt-5 text-sm leading-relaxed text-muted-foreground">
            <p><strong className="text-foreground">{instance.name} is an instance of Polsimmer</strong>, a free, open-source, self-hostable political simulation web game. Form parties, run in elections, debate bills, and shape a shared nation.</p>
            <p>Anyone can host their own instance with its own nation, community, and political story.</p>
            <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 font-medium text-primary lg:justify-start">
              <span>Host your own <a href="https://github.com/ajstrongdev/polsimmer" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-primary/80">now</a>.</span>
              {instance.social.community && (
                <a href={instance.social.community} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-primary/80">Join the {instance.name} community</a>
              )}
            </div>
          </div>
        </div>
        <div className="w-full max-w-md justify-self-center space-y-4">{children}</div>
      </div>
    </div>
  );
}
