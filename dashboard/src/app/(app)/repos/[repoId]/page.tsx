import { redirect } from "next/navigation";

export default async function RepoIndex({ params }: PageProps<"/repos/[repoId]">) {
  redirect(`/repos/${(await params).repoId}/queue`);
}
