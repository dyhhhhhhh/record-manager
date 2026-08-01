import { AppShell } from "@/components/app-shell";
import { requireOwner } from "@/features/auth/require-owner";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return <AppShell>{children}</AppShell>;
}
