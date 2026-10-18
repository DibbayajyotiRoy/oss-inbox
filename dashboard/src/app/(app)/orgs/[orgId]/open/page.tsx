import { redirect } from "next/navigation"
import { openARepo } from "../../../landing"

/** Entry for an organization (the org switcher): open one of its repos. No repo yet: the list, which says how to add one. */
export default async function OpenOrg({ params }: PageProps<"/orgs/[orgId]/open">) {
  const { orgId } = await params
  await openARepo([Number(orgId)])
  redirect(`/orgs/${orgId}`)
}
