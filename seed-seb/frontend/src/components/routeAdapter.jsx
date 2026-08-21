/**
 * Wraps browser UI screens so they render in the client with AppShell.
 * These screens interact with browser APIs (localStorage, webcam, canvas) and
 * render inside the ClientOnly TanStack boundary.
 */
import React, { Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";

import AppShell, { AppShellLoading } from "./AppShell";

export function createRouteAdapter(importer) {
  const LazyScreen = React.lazy(importer);

  return function ScreenRoute() {
    return (
      <ClientOnly fallback={<AppShellLoading />}>
        <Suspense fallback={<AppShellLoading />}>
          <AppShell>
            <LazyScreen />
          </AppShell>
        </Suspense>
      </ClientOnly>
    );
  };
}
