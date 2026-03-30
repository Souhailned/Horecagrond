import { Suspense } from "react";
import { getUsers } from "@/app/actions/admin/users";
import { ImpersonateUsersDataTable } from "@/components/admin/impersonate-users-data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Warning } from "@phosphor-icons/react/dist/ssr";
import {
  ContentCard,
  ContentCardHeader,
  ContentCardBody,
} from "@/components/dashboard/content-card";

export const metadata = {
  title: "Impersonate User | Admin",
  description: "Impersonate users to view the application from their perspective",
};

interface PageProps {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    role?: string;
    status?: string;
  }>;
}

async function ImpersonateContent({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = params.page ? parseInt(params.page) : 1;
  const pageSize = params.pageSize ? parseInt(params.pageSize) : 10;
  const search = params.search;
  const sortBy = params.sortBy;
  const sortOrder = params.sortOrder;
  const role = params.role;
  const status = params.status;

  const result = await getUsers({
    page,
    pageSize,
    search,
    sortBy,
    sortOrder,
    role,
    status,
  });

  if (!result.success || !result.data) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="text-destructive">
            {result.success ? "Failed to load users" : result.error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ImpersonateUsersDataTable
      data={result.data.users}
      pageCount={result.data.pageCount}
      total={result.data.total}
    />
  );
}

export default function ImpersonatePage(props: PageProps) {
  return (
    <ContentCard>
      <ContentCardHeader title="Impersonate User" />
      <ContentCardBody className="p-4">
        <div className="flex flex-col gap-6">
          <Alert>
            <Warning className="h-4 w-4" weight="bold" />
            <AlertTitle>Important</AlertTitle>
            <AlertDescription>
              When you impersonate a user, you will see the application exactly as
              they do. All actions you perform will be done on their behalf. The
              impersonation session will last for 1 hour or until you stop
              impersonating.
            </AlertDescription>
          </Alert>

          <Suspense
            fallback={
              <DataTableSkeleton
                columnCount={5}
                rowCount={10}
                filterCount={2}
                withViewOptions={true}
                withPagination={true}
                cellRenderer={(rowIndex, colIndex) => {
                  if (colIndex === 0) {
                    return (
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-8 w-8 flex-shrink-0 rounded-full" />
                        <div className="flex flex-col gap-2">
                          <Skeleton className="h-4 w-[150px]" />
                          <Skeleton className="h-3 w-[200px]" />
                        </div>
                      </div>
                    );
                  }
                  return <Skeleton className="h-4 w-full" />;
                }}
              />
            }
          >
            <ImpersonateContent searchParams={props.searchParams} />
          </Suspense>
        </div>
      </ContentCardBody>
    </ContentCard>
  );
}
