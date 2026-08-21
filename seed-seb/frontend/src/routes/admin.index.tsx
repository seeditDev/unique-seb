import { createFileRoute } from "@tanstack/react-router";

import { createRouteAdapter } from '@/components/routeAdapter';

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Admin Portal — SEED-SEB" },
      {
        name: "description",
        content:
          "Admin portal management for challenges, contests, and user permissions.",
      },
      { property: "og:title", content: "Admin Portal — SEED-SEB" },
      {
        property: "og:description",
        content: "Admin portal for SEED-SEB.",
      },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: createRouteAdapter(() => import("@/components/AdminQuestionBank")),
});
