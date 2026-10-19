import type { Metadata } from "next";
import { WelcomeFlow } from "@/components/onboarding/welcome-flow";
import { Preloaded } from "@/lib/server-api";

export const metadata: Metadata = { title: "Set up OSS Inbox" };

export default function Welcome() {
  return (
    <Preloaded paths={["/api/setup/status"]}>
      <WelcomeFlow />
    </Preloaded>
  );
}
