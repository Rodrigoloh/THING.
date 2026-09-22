import { notFound } from "next/navigation";
import { connection } from "next/server";
import { IdentityPanel } from "@/features/auth/identity-panel";

export default async function DevPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  await connection();
  return <IdentityPanel />;
}