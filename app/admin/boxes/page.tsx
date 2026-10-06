import { redirect } from "next/navigation";

// The old mock box editor is replaced by the real menu management page.
export default function AdminBoxesPage() {
  redirect("/admin/menu");
}
