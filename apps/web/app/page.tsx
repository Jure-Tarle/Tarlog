import { redirect } from "next/navigation";

/** Root → Dashboard (doc 11 §2 Nr. 1). */
export default function Home(): never {
  redirect("/dashboard");
}
