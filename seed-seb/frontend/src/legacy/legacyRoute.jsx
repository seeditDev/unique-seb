/**
 * Wraps a legacy CRA screen so it renders only in the browser.
 * These screens read localStorage, webcam and canvas APIs at render time, so
 * they must never execute during SSR.
 */
import React, { Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";

import AppShell, { AppShellLoading } from "./AppShell";

export function createLegacyRoute(importer) {
  const LazyScreen = React.lazy(importer);

  return function LegacyRoute() {
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
