import { Suspense } from "react";
import { getAgencies } from "@/app/actions/admin/agencies";
import { AgenciesDataTable } from "@/components/admin/agencies-data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";

export const metadata = {
  title: "Agencies | Admin",
  description: "Manage agencies and their settings",
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    verified?: string;
    plan?: string;
  }>;
}

async function AgenciesContent({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = params.page ? parseInt(params.page) : 1;
  const pageSize = params.pageSize ? parseInt(params.pageSize) : 10;
  const search = params.search;
  const sortBy = params.sortBy;
  const sortOrder = params.sortOrder;
  const verified = params.verified;
  const plan = params.plan;

  const result = await getAgencies({
    page,
    pageSize,
    search,
    sortBy,
    sortOrder,
    verified,
    plan,
  });

  if (!result.success) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="text-destructive">
            {result.error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <AgenciesDataTable
      data={result.data.agencies}
      pageCount={result.data.pageCount}
      total={result.data.total}
    />
  );
}

export default function AgenciesPage(props: PageProps) {
  return (
    <div className="container mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Agencies</h1>
            <p className="text-muted-foreground mt-1">
              Manage agencies, verify status, and adjust subscription plans
            </p>
          </div>
        </div>

        <Suspense
          fallback={
            <DataTableSkeleton
              columnCount={8}
              rowCount={5}
              filterCount={2}
              withViewOptions={true}
              withPagination={true}
              cellRenderer={(rowIndex, colIndex) => {
                if (colIndex === 0) {
                  return (
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
                      <div className="flex flex-col gap-2">
                        <Skeleton className="h-4 w-[120px]" />
                        <Skeleton className="h-3 w-[80px]" />
                      </div>
                    </div>
                  );
                }
                if (colIndex === 1) {
                  return (
                    <div className="flex flex-col gap-1">
                      <Skeleton className="h-4 w-[100px]" />
                      <Skeleton className="h-3 w-[140px]" />
                    </div>
                  );
                }
                if (colIndex === 2 || colIndex === 3) {
                  return <Skeleton className="h-5 w-[70px] rounded-full" />;
                }
                return <Skeleton className="h-4 w-full" />;
              }}
            />
          }
        >
          <AgenciesContent searchParams={props.searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
