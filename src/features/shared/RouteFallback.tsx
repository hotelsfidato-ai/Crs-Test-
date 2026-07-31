import { Page, Skeleton } from "@/components/ui";

/* Shown while a lazily-loaded route chunk arrives. Deliberately
   shaped like a page header plus content so the transition does
   not jump when the real screen mounts. */

export function RouteFallback() {
  return (
    <Page>
      <div className="mb-6">
        <Skeleton className="h-3 w-40 mb-3" />
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-3.5 w-96 mt-3" />
      </div>
      <div className="bg-white border border-grey-200 rounded-md p-5">
        <Skeleton className="h-3.5 w-full mb-3" />
        <Skeleton className="h-3.5 w-11/12 mb-3" />
        <Skeleton className="h-3.5 w-4/5" />
      </div>
    </Page>
  );
}
