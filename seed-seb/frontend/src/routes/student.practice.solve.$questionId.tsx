import { createFileRoute } from "@tanstack/react-router";

import { createLegacyRoute } from "@/legacy/legacyRoute";

export const Route = createFileRoute("/student/practice/solve/$questionId")({
  head: () => ({
    meta: [
      { title: "Practice problem — SEED-SEB" },
      {
        name: "description",
        content: "Practice a coding problem with live test cases in the SEED-SEB sandbox.",
      },
      { property: "og:title", content: "Practice problem — SEED-SEB" },
      {
        property: "og:description",
        content: "Practice a coding problem with live test cases in the SEED-SEB sandbox.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: createLegacyRoute(() => import("@/legacy/components/PracticeSandbox")),
});
