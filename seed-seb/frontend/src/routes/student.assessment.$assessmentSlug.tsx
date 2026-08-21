import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Compatibility route: /student/assessment/:slug → /student/assessment/id/:slug
 *
 * This handles any deep-linked or bookmarked URLs that use the shorter path.
 * The canonical URL is /student/assessment/id/:assessmentSlug.
 */
export const Route = createFileRoute("/student/assessment/$assessmentSlug")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/student/assessment/id/$assessmentSlug",
      params: { assessmentSlug: params.assessmentSlug },
      replace: true,
    });
  },
  component: () => null,
});
