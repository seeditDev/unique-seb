import { createFileRoute } from "@tanstack/react-router";

import { createLegacyRoute } from "@/legacy/legacyRoute";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — SEED-SEB Secure Exam Portal" },
      {
        name: "description",
        content:
          "Sign in to the SEED-SEB secure exam portal to take proctored MCQ, coding and spoken-English assessments.",
      },
      { property: "og:title", content: "Sign in — SEED-SEB Secure Exam Portal" },
      {
        property: "og:description",
        content: "Secure, proctored assessments for students inside the SEED-SEB desktop app.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: createLegacyRoute(() => import("@/legacy/components/Login")),
});
