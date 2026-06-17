"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

export default function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button className="button" disabled={isPending} onClick={() => startTransition(() => router.refresh())} type="button">
      <RefreshCw size={16} />
      {isPending ? "Refreshing" : "Refresh"}
    </button>
  );
}
