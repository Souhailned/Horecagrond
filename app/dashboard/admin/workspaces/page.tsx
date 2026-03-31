import { Suspense } from "react";
import { getWorkspaces } from "@/app/actions/admin/workspaces";
import { WorkspacesDataTable } from "@/components/admin/workspaces-data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { WorkspaceCreateDialog } from "@/components/admin/workspace-create-dialog";
import {
  ContentCard,
  ContentCardHeader,
  ContentCardBody,
} from "@/components/dashboard/content-card";

export const metadata = {
  title: "Workspace Management | Admin",
  description: "Manage workspaces and their members",
};

interface PageProps {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }>;
}

async function WorkspacesContent({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = params.page ? parseInt(params.page) : 1;
  const pageSize = params.pageSize ? parseInt(params.pageSize) : 10;
  const search = params.search;
  const sortBy = params.sortBy;
  const sortOrder = params.sortOrder;

  const result = await getWorkspaces({
    page,
    pageSize,
    search,
    sortBy,
    sortOrder,
  });

  if (!result.success || !result.data) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="text-destructive">
            {result.success ? "Failed to load workspaces" : result.error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <WorkspacesDataTable
      data={result.data.workspaces}
      pageCount={result.data.pageCount}
      total={result.data.total}
    />
  );
}

export default function WorkspacesPage(props: PageProps) {
  return (
    <ContentCard>
      <ContentCardHeader
        title="Workspace Management"
        actions={
          <WorkspaceCreateDialog>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" weight="bold" />
              Add Workspace
            </Button>
          </WorkspaceCreateDialog>
        }
      />
      <ContentCardBody className="p-4">
        <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
          <WorkspacesContent searchParams={props.searchParams} />
        </Suspense>
      </ContentCardBody>
    </ContentCard>
  );
}
