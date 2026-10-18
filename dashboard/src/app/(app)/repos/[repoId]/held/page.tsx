import { ReviewList } from "@/components/review-list"
import { Preloaded } from "@/lib/server-api"

export default async function Held({ params }: PageProps<"/repos/[repoId]/held">) {
  return (
    <Preloaded paths={[`/api/repos/${(await params).repoId}/queue?bucket=held&limit=100`]}>
      <ReviewList bucket="held" />
    </Preloaded>
  )
}
