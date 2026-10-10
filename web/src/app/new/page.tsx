import { Brief } from "@/components/brief/Brief";
import { demoBriefInput } from "@/lib/mock/panel";

export const metadata = { title: "New rehearsal" };

export default function NewRehearsalPage() {
  return <Brief sample={demoBriefInput} />;
}
