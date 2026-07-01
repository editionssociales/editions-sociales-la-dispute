import { redirect } from "next/navigation";

/** La boutique est désormais fusionnée dans le catalogue unique. */
export default function BoutiquePage() {
  redirect("/catalogue");
}
