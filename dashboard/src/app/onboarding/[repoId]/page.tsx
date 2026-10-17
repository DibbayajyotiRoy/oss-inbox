import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RepoFlow } from "@/components/onboarding/repo-flow";

export const metadata: Metadata = { title: "Set up repository" };

export default async function RepoOnboarding({ params }: PageProps<"/onboarding/[repoId]">) {
  const id = Number((await params).repoId);
  if (!Number.isInteger(id) || id < 1) notFound();
  return <RepoFlow repoId={id} />;
}
