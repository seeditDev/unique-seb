import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/guest")({
  beforeLoad: () => {
    throw redirect({ to: "/login" });
  },
});
