import { Preloaded } from "@/lib/server-api"

export default async function ItemLayout({ params, children }: LayoutProps<"/items/[itemId]">) {
  return <Preloaded paths={[`/api/items/${(await params).itemId}`]}>{children}</Preloaded>
}
