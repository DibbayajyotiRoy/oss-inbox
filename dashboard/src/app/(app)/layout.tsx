import { cookies } from "next/headers";
import { Shell } from "@/components/shell/app-shell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // The sidebar writes this cookie when toggled, so the first paint already has the right width.
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  return <Shell defaultOpen={defaultOpen}>{children}</Shell>;
}
