import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/** A repo that is not enabled yet goes to onboarding; otherwise straight to the queue. */
export default async function RepoIndex({ params }: PageProps<"/repos/[repoId]">) {
  const { repoId } = await params;
  const res = await fetch(`${process.env.API_URL ?? "http://localhost:8000"}/api/repos/${repoId}`, {
    headers: { cookie: (await cookies()).toString() },
    cache: "no-store",
  }).catch(() => null);
  const repo: { enabled?: boolean } | null = res?.ok ? await res.json() : null; // unreachable or 401/404: the queue shows the real error
  redirect(repo && repo.enabled === false ? `/onboarding/${repoId}` : `/repos/${repoId}/queue`);
}
