import { RepoGate } from "@/components/repo"
import { Preloaded } from "@/lib/server-api"

// Navigation lives in the shell sidebar (components/shell/nav.ts); this is only the repo's identity and state.
export default async function RepoLayout({ params, children }: LayoutProps<"/repos/[repoId]">) {
  const { repoId } = await params
  return (
    <Preloaded paths={[`/api/repos/${repoId}`]}>
      <RepoGate>{children}</RepoGate>
    </Preloaded>
  )
}
