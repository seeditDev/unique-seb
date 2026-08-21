import { createFileRoute } from "@tanstack/react-router";

import { createLegacyRoute } from "@/legacy/legacyRoute";

export const Route = createFileRoute("/student/practice/course/$courseId/$questionId")({
  head: () => ({
    meta: [
      { title: "Course practice — SEED-SEB" },
      {
        name: "description",
        content: "Work through course-linked coding exercises in the SEED-SEB practice sandbox.",
      },
      { property: "og:title", content: "Course practice — SEED-SEB" },
      {
        property: "og:description",
        content: "Work through course-linked coding exercises in the SEED-SEB practice sandbox.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: createLegacyRoute(() => import("@/legacy/components/PracticeCourseSandbox")),
});
