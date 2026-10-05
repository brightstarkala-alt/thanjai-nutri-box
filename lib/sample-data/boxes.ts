import type { BoxId, BoxMenuEntry } from "@/lib/types";

// NOTE: used only by /admin/boxes' local editing sandbox (not connected
// to Supabase — see that page's banner). The customer-facing app reads
// real box identities from the `box_types` table via MenuProvider, not
// from this file.
//
// Box identities are fixed and NOT admin-editable — only their contents are.
export const BOX_IDENTITIES: { id: BoxId; name: string }[] = [
  { id: "box-1", name: "Box 1" },
  { id: "box-2", name: "Box 2" },
];

// Fallback menu used to seed the admin sandbox — description is
// intentionally generic (do not fill this in with invented dishes).
export const DEFAULT_BOX_MENUS: Record<BoxId, BoxMenuEntry> = {
  "box-1": {
    boxId: "box-1",
    date: null,
    description: "Menu to be updated by admin.",
    price: 90,
    available: true,
  },
  "box-2": {
    boxId: "box-2",
    date: null,
    description: "Menu to be updated by admin.",
    price: 110,
    available: true,
  },
};
