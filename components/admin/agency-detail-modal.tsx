"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building,
  Calendar,
  Crown,
  Mail,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  Users,
  Zap,
  Clock,
  UserPlus,
  FileText,
  Edit,
  MessageSquare,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { getAgencyById } from "@/app/actions/admin/agencies";
import type { AdminAgency, AdminAgencyDetail, AgencyPlan } from "@/types/admin";

interface AgencyDetailModalProps {
  agency: AdminAgency;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const planIcons: Record<AgencyPlan, React.ReactNode> = {
  FREE: <Zap className="h-4 w-4" />,
  PRO: <Sparkles className="h-4 w-4" />,
  ENTERPRISE: <Crown className="h-4 w-4" />,
};

const planVariants: Record<AgencyPlan, "secondary" | "default" | "destructive"> = {
  FREE: "secondary",
  PRO: "default",
  ENTERPRISE: "destructive",
};

const activityIcons: Record<string, React.ReactNode> = {
  member_joined: <UserPlus className="h-4 w-4 text-green-500" />,
  listing_created: <FileText className="h-4 w-4 text-blue-500" />,
  listing_updated: <Edit className="h-4 w-4 text-orange-500" />,
  inquiry_received: <MessageSquare className="h-4 w-4 text-purple-500" />,
};

export function AgencyDetailModal({
  agency,
  open,
  onOpenChange,
}: AgencyDetailModalProps) {
  const [detailData, setDetailData] = React.useState<AdminAgencyDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Fetch detailed data when modal opens
  React.useEffect(() => {
    if (open && agency.id) {
      setLoading(true);
      setError(null);

      getAgencyById(agency.id)
        .then((result) => {
          if (result.success && result.data) {
            setDetailData(result.data);
          } else {
            setError(result.success ? "Failed to load agency details" : result.error);
          }
        })
        .catch((err) => {
          console.error("Error fetching agency details:", err);
          setError("An unexpected error occurred");
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [open, agency.id]);

  const initials = agency.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh]">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={agency.image || undefined} alt={agency.name} />
              <AvatarFallback className="text-lg">
                <Building className="h-6 w-6" />
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <DialogTitle className="text-xl flex items-center gap-2">
                {agency.name}
                {agency.verified && (
                  <ShieldCheck className="h-5 w-5 text-green-500" />
                )}
              </DialogTitle>
              <DialogDescription className="mt-1">
                <span className="font-mono text-sm">/{agency.slug}</span>
              </DialogDescription>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant={planVariants[agency.plan]} className="gap-1">
                  {planIcons[agency.plan]}
                  {agency.plan}
                </Badge>
                <Badge variant={agency.verified ? "default" : "outline"} className="gap-1">
                  {agency.verified ? (
                    <ShieldCheck className="h-3 w-3" />
                  ) : (
                    <ShieldOff className="h-3 w-3" />
                  )}
                  {agency.verified ? "Verified" : "Unverified"}
                </Badge>
              </div>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="overview" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-4">
                {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-2xl font-bold">
                      {agency._count?.members ?? 0}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                      <Users className="h-3 w-3" />
                      Members
                    </div>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-2xl font-bold">
                      {agency._count?.listings ?? 0}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                      <FileText className="h-3 w-3" />
                      Listings
                    </div>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <div className="text-2xl font-bold">
                      {agency._count?.invitations ?? 0}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                      <Mail className="h-3 w-3" />
                      Invitations
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Owner */}
                <div>
                  <h4 className="text-sm font-medium mb-2">Owner</h4>
                  {agency.owner ? (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>
                          {agency.owner.name?.[0]?.toUpperCase() ||
                            agency.owner.email[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">
                          {agency.owner.name || "No name"}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {agency.owner.email}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      No owner assigned
                    </div>
                  )}
                </div>

                <Separator />

                {/* Dates */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium mb-1 flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      Created
                    </h4>
                    <div className="text-sm text-muted-foreground">
                      {format(new Date(agency.createdAt), "PPP")}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium mb-1 flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      Updated
                    </h4>
                    <div className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(agency.updatedAt), {
                        addSuffix: true,
                      })}
                    </div>
                  </div>
                </div>

                {agency.verifiedAt && (
                  <div>
                    <h4 className="text-sm font-medium mb-1 flex items-center gap-1">
                      <ShieldCheck className="h-4 w-4 text-green-500" />
                      Verified At
                    </h4>
                    <div className="text-sm text-muted-foreground">
                      {format(new Date(agency.verifiedAt), "PPP")}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="members" className="mt-4">
            <ScrollArea className="h-[300px] pr-4">
              {loading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="text-center py-8 text-destructive">{error}</div>
              ) : detailData?.members && detailData.members.length > 0 ? (
                <div className="space-y-2">
                  {detailData.members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage
                            src={member.user.image || undefined}
                            alt={member.user.name || member.user.email}
                          />
                          <AvatarFallback>
                            {member.user.name?.[0]?.toUpperCase() ||
                              member.user.email[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">
                            {member.user.name || "No name"}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {member.user.email}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={member.role === "OWNER" ? "default" : "secondary"}
                        >
                          {member.role === "OWNER" && (
                            <Crown className="h-3 w-3 mr-1" />
                          )}
                          {member.role}
                        </Badge>
                        <div className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(member.joinedAt), {
                            addSuffix: true,
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No members found
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <ScrollArea className="h-[300px] pr-4">
              {loading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 py-2">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="text-center py-8 text-destructive">{error}</div>
              ) : detailData?.recentActivity &&
                detailData.recentActivity.length > 0 ? (
                <div className="space-y-1">
                  {detailData.recentActivity.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-start gap-3 py-2 border-b last:border-0"
                    >
                      <div className="mt-1 p-1.5 rounded-full bg-muted">
                        {activityIcons[activity.type] || (
                          <Clock className="h-4 w-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm">{activity.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDistanceToNow(new Date(activity.timestamp), {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No recent activity
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
