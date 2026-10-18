import { Preloaded } from "@/lib/server-api"

export default async function Layout({ params, children }: LayoutProps<"/repos/[repoId]/ci-gate">) {
  return <Preloaded paths={[`/api/repos/${(await params).repoId}/ci-reports?limit=50`]}>{children}</Preloaded>
}
