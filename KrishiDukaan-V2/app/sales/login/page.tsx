import type { Metadata } from "next";
import SalesLoginClient from "./login-client";

export const metadata: Metadata = {
  title: "Sales Login | KrishiDukaan",
};

export default function SalesLoginPage() {
  return <SalesLoginClient />;
}
