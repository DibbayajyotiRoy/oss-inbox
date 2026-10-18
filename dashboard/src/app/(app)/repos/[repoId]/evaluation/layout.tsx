import { Preloaded } from "@/lib/server-api"

export default async function Layout({ params, children }: LayoutProps<"/repos/[repoId]/evaluation">) {
  return <Preloaded paths={[`/api/repos/${(await params).repoId}/evaluation`]}>{children}</Preloaded>
}
