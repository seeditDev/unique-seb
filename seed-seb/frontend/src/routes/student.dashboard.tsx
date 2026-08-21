import { createFileRoute } from "@tanstack/react-router";

import { createLegacyRoute } from "@/legacy/legacyRoute";

export const Route = createFileRoute("/student/dashboard")({
  head: () => ({
    meta: [
      { title: "Student dashboard — SEED-SEB" },
      {
        name: "description",
        content:
          "Your assessments, practice tracks and results in the SEED-SEB secure exam portal.",
      },
      { property: "og:title", content: "Student dashboard — SEED-SEB" },
      {
        property: "og:description",
        content: "Assessments, practice tracks and results for SEED-SEB students.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: createLegacyRoute(() => import("@/legacy/components/StudentDashboard")),
});
