import { redirect } from "next/navigation";

// Warranties are registered only with the card inside the Solarzed carton, by an SMS-verified mobile.
// The old open installer form is gone; old links land on the activation page.
export default function RegisterPage() {
  redirect("/activate");
}
