import { Preloaded } from "@/lib/server-api"

export default async function Layout({ params, children }: LayoutProps<"/repos/[repoId]/flaky">) {
  return <Preloaded paths={[`/api/repos/${(await params).repoId}/flaky-tests`]}>{children}</Preloaded>
}
