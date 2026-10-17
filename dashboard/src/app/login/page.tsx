import type { Metadata } from "next";
import { LoginPanel } from "@/components/onboarding/login-panel";

export const metadata: Metadata = { title: "Sign in" };

export default function Login() {
  return <LoginPanel />;
}
