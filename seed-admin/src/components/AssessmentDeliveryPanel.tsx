/**
 * AssessmentDeliveryPanel.tsx
 *
 * Shows the full delivery chain for a given assessment:
 *   Assessment status -> Linked Tests -> Assigned Cohorts -> Student count
 *
 * Answers the admin's key questions:
 *     Is the assessment published?
 *     Is it attached to a Course Test?
 *     Which Course / Series?
 *     Which Cohorts?
 *     How many students can access it?
 */

import { useQuery } from "@tanstack/react-query";
import { getAssessmentDeliveryStatus } from "@/lib/firestore/delivery";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock,
  Layers,
  Users,
  XCircle,
} from "lucide-react";

interface Props {
  assessmentId: string;
  /** If true, renders as a compact inline strip instead of a full card */
  compact?: boolean;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "active") {
    return (
      <Badge className="gap-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-3" />
        Published
      </Badge>
    );
  }
  if (status === "archived") {
    return (
      <Badge className="gap-1 rounded-full bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
        <XCircle className="size-3" />
        Archived
      </Badge>
    );
  }
  return (
    <Badge className="gap-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
      <Clock className="size-3" />
      Draft
    </Badge>
  );
}

export function AssessmentDeliveryPanel({ assessmentId, compact = false }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["assessmentDelivery", assessmentId],
    queryFn: () => getAssessmentDeliveryStatus(assessmentId),
    enabled: Boolean(assessmentId),
    staleTime: 60_000,
  });

  if (!assessmentId) return null;

  if (isLoading || !data) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-6 w-40 rounded-lg" />
        <Skeleton className="h-4 w-64 rounded-lg" />
      </div>
    );
  }

  const { assessmentStatus, assessmentVersion, tests, cohorts, totalStudents } = data;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <StatusBadge status={assessmentStatus} />
        <span className="text-muted-foreground">|</span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <BookOpen className="size-3" />
          <span className="font-medium text-foreground">{tests.length}</span> tests
        </span>
        <span className="text-muted-foreground">|</span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <Layers className="size-3" />
          <span className="font-medium text-foreground">{cohorts.length}</span> cohorts
        </span>
        {cohorts.length > 0 && (
          <>
            <span className="text-muted-foreground">|</span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Users className="size-3" />
              <span className="font-medium text-foreground">{totalStudents}</span> students
            </span>
          </>
        )}
      </div>
    );
  }

  return (
    <Card className="rounded-2xl border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <CircleDot className="size-4 text-primary" />
          Delivery Status
          <span className="ml-auto font-mono text-xs font-normal text-muted-foreground">
            v{assessmentVersion}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status row */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">Assessment status</span>
          <StatusBadge status={assessmentStatus} />
        </div>

        {/* Tests */}
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <BookOpen className="size-3" />
            Course Tests ({tests.length})
          </div>
          {tests.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
              Not yet attached to any Course Test — go to{" "}
              <strong>Courses</strong> to create a test from this assessment.
            </p>
          ) : (
            <ul className="space-y-1">
              {tests.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-xs"
                >
                  <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
                  <span className="font-medium">{t.title}</span>
                  <span className="text-muted-foreground">-</span>
                  <span className="text-muted-foreground">{t.courseId}</span>
                  <span className="text-muted-foreground/60">&gt;</span>
                  <span className="text-muted-foreground">{t.seriesId}</span>
                  {t.assessmentVersion < data.assessmentVersion && (
                    <Badge className="ml-auto rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] px-1.5 py-0">
                      stale v{t.assessmentVersion}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Cohorts */}
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <Layers className="size-3" />
            Assigned Cohorts ({cohorts.length})
          </div>
          {cohorts.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
              Not assigned to any cohort yet — go to{" "}
              <strong>Assign Modules</strong> to grant student access.
            </p>
          ) : (
            <div className="space-y-1">
              <ul className="space-y-1">
                {cohorts.map((c) => (
                  <li
                    key={c.tenantId + "-" + c.cohortId}
                    className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-xs"
                  >
                    <Users className="size-3 shrink-0 text-muted-foreground" />
                    <span className="font-medium">{c.tenantName || c.tenantId}</span>
                    <span className="text-muted-foreground">-</span>
                    <span>{c.cohortLabel || c.cohortId}</span>
                    {c.cohortYear && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {c.cohortYear}
                      </Badge>
                    )}
                    {c.studentCount > 0 && (
                      <span className="ml-auto text-muted-foreground font-mono text-[10px]">
                        ~{c.studentCount} students
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {totalStudents > 0 && (
                <p className="pt-1 text-right text-[11px] text-muted-foreground">
                  Est. accessible students:{" "}
                  <strong className="text-foreground">{totalStudents}</strong>
                </p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
