import { CirclePower } from "lucide-react";
import { BRAND_NAME } from "@/features/marketing";

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <CirclePower className="size-5" />
      <span className="font-semibold">{BRAND_NAME}</span>
    </span>
  );
}
