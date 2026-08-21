import { createFileRoute } from "@tanstack/react-router";
import { createLegacyRoute } from "@/legacy/legacyRoute";

export const Route = createFileRoute("/guest")({
  head: () => ({
    meta: [
      { title: "Guest Assessment Portal — SEED-SEB" },
      {
        name: "description",
        content:
          "Take a SEED-SEB assessment without an account. Enter your assessment code to get started.",
      },
      { property: "og:title", content: "Guest Assessment Portal — SEED-SEB" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: createLegacyRoute(() => import("@/legacy/components/GuestPortal")),
});
