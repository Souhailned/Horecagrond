import { requirePagePermission } from "@/lib/session";
import { ProfileWizard } from "@/components/intelligence/profile-wizard";

export default async function NieuwProfielPage() {
  await requirePagePermission("intelligence:manage");

  return <ProfileWizard />;
}
