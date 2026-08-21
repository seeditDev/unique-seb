import { createFileRoute } from "@tanstack/react-router";

import { createLegacyRoute } from "@/legacy/legacyRoute";

export const Route = createFileRoute("/admin/questions")({
  head: () => ({
    meta: [
      { title: "Admin Question Bank — SEED-SEB" },
      {
        name: "description",
        content:
          "Admin question bank management for challenges, contests, and user permissions.",
      },
      { property: "og:title", content: "Admin Question Bank — SEED-SEB" },
      {
        property: "og:description",
        content: "Admin question bank for SEED-SEB.",
      },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: createLegacyRoute(() => import("@/legacy/components/AdminQuestionBank")),
});
