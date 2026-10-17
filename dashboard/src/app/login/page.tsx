export const metadata = { title: "Sign in" };

export default function Login() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-semibold">Jev Triage</h1>
      <p className="text-muted">
        Triage for GitHub issues and pull requests that earns trust before it acts. It starts in shadow mode, never closes or
        deletes anything, and shows its measured accuracy so you decide when each feature is allowed to run on its own.
      </p>
      <a href="/api/auth/login" className="btn btn-primary self-start">Sign in with GitHub</a>
      <p className="text-xs text-muted">Access follows your GitHub permissions on each repository.</p>
    </main>
  );
}
