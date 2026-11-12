import { redirect } from "react-router";

import type { Route } from "./+types/checkout";
import { createCheckout } from "~/lib/checkout.server";

export function loader() {
  return redirect("/#download");
}

export async function action({ request }: Route.ActionArgs) {
  const url = await createCheckout(new URL(request.url).origin);
  return redirect(url ?? "/?checkout=failed#download", 303);
}
