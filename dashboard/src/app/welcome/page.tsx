import type { Metadata } from "next";
import { WelcomeFlow } from "@/components/onboarding/welcome-flow";

export const metadata: Metadata = { title: "Set up Jev Triage" };

export default function Welcome() {
  return <WelcomeFlow />;
}
