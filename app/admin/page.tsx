import type { Metadata } from "next";
import { AdminDashboard } from "@/components/admin-dashboard";
import { AdminGate } from "@/components/auth-gate";

export const metadata: Metadata = {
  title: "Admin",
};

export default function AdminPage() {
  return (
    <AdminGate>
      <AdminDashboard />
    </AdminGate>
  );
}
