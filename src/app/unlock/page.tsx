import { Suspense } from "react";
import UnlockForm from "./UnlockForm";

export default function UnlockPage() {
  return (
    <Suspense>
      <UnlockForm />
    </Suspense>
  );
}
