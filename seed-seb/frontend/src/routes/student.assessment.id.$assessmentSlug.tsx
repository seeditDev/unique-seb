import { createFileRoute } from "@tanstack/react-router";
import { createLegacyRoute } from "@/legacy/legacyRoute";

/**
 * Canonical Assessment route.
 *
 * Every assessment — regardless of the section types it contains
 * (MCQ, Coding, Spoken English) — is launched through this single route.
 * The runtime is MultiSectionAssessment which handles all section types.
 *
 * URL: /student/assessment/id/:assessmentSlug
 */
export const Route = createFileRoute("/student/assessment/id/$assessmentSlug")({
  head: () => ({
    meta: [
      { title: "Assessment — SEED-SEB" },
      {
        name: "description",
        content:
          "Attempt a proctored assessment. May contain MCQ, Coding, or Spoken English sections.",
      },
      { property: "og:title", content: "Assessment — SEED-SEB" },
      {
        property: "og:description",
        content: "Attempt a proctored assessment.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: createLegacyRoute(
    () => import("@/legacy/components/MultiSectionAssessment")
  ),
});
