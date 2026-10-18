import { Preloaded } from "@/lib/server-api"
import { Home } from "./home"
import { openARepo } from "./landing"

/** `/` opens a repo (see `openARepo`). Only a visitor with no organization or no repository sees `Home`. */
export default async function Page() {
  await openARepo()
  return (
    <Preloaded paths={["/api/setup/status"]}>
      <Home />
    </Preloaded>
  )
}
