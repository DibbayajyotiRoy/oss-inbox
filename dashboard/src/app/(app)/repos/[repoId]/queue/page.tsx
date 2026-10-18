import { ReviewList } from "@/components/review-list"
import { Preloaded } from "@/lib/server-api"

export default async function Queue({ params }: PageProps<"/repos/[repoId]/queue">) {
  return (
    <Preloaded paths={[`/api/repos/${(await params).repoId}/queue?bucket=review&limit=100`]}>
      <ReviewList bucket="review" />
    </Preloaded>
  )
}
