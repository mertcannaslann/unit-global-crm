import { CrmApp } from "@/components/app/unit-crm";

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CrmApp slug={["portfoyler", id, "duzenle"]} />;
}
