import { CrmApp } from "@/components/app/unit-crm";

export default async function LeadDetailRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CrmApp slug={["musteriler", id]} />;
}
