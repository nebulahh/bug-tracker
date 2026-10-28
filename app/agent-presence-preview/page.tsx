import type { Metadata } from "next";
import Link from "next/link";
import { AgentGraphic } from "@/components/agent-graphic";
import type { AgentStatus } from "@/lib/dashboard-overview";

export const metadata: Metadata = {
  title: "Agent presence preview",
  robots: { index: false, follow: false },
};

const sampleAgents: {
  name: string;
  role: string;
  status: AgentStatus;
  statusLabel: string;
}[] = [
  { name: "Ajala", role: "Triager", status: "working", statusLabel: "Working" },
  { name: "ChatGPT Agent", role: "Reviewer", status: "waiting", statusLabel: "Waiting on you" },
  { name: "Handy's Agent", role: "Reviewer", status: "idle", statusLabel: "Awake and ready" },
  { name: "ChatGPT Contributor", role: "Contributor", status: "offline", statusLabel: "Sleeping" },
];

export default function AgentPresencePreviewPage() {
  return (
    <main className="min-h-screen bg-zk-page px-5 py-12 text-zk-text sm:px-8 sm:py-16">
      <div className="mx-auto max-w-3xl space-y-8">
        <Link href="/" className="text-sm font-semibold text-zk-accent hover:underline">
          ← Back to Ziki
        </Link>

        <header className="space-y-3">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-zk-accent">
            A little more life in the agent list
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Know who&apos;s awake at a glance.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-zk-muted">
            Each agent has a small, animated companion. Open eyes mean it&apos;s active; a gentle
            snooze means it&apos;s been quiet. The status stays visible beside the name, so people know
            when to ask, wait, or move on.
          </p>
        </header>

        <section
          aria-labelledby="agent-menu-heading"
          className="overflow-hidden rounded-3xl border border-zk-border bg-zk-surface shadow-[0_18px_50px_rgba(11,23,51,0.10)]"
        >
          <div className="border-b border-zk-border px-6 py-5">
            <h2 id="agent-menu-heading" className="text-xs font-extrabold uppercase tracking-wider text-zk-muted">
              Project agents
            </h2>
          </div>
          <ul className="divide-y divide-zk-border">
            {sampleAgents.map((agent) => (
              <li key={agent.name} className="flex items-center gap-3 px-6 py-4">
                <AgentGraphic name={agent.name} status={agent.status} size={42} />
                <span className="min-w-0 flex-1 truncate font-bold">{agent.name}</span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-bold ${
                    agent.status === "offline"
                      ? "bg-zk-chip text-zk-muted"
                      : "bg-zk-ok-bg text-zk-ok-fg"
                  }`}
                >
                  {agent.statusLabel}
                </span>
                <span className="rounded-full bg-zk-info-bg px-3 py-1 text-xs font-bold text-zk-info-fg">
                  {agent.role}
                </span>
              </li>
            ))}
          </ul>
          <p className="px-6 py-4 text-sm text-zk-muted">
            In the app, these same avatars replace the initials in the Agents menu and agent settings.
          </p>
        </section>

        <p className="text-xs text-zk-muted">
          Preview only · Sample agents · No account or project data is shown
        </p>
      </div>
    </main>
  );
}
