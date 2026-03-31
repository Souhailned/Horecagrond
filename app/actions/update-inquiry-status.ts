"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

type InquiryStatus = "NEW" | "VIEWED" | "CONTACTED" | "VIEWING_SCHEDULED" | "NEGOTIATING" | "CLOSED_WON" | "CLOSED_LOST" | "SPAM";

export async function updateInquiryStatus(inquiryId: string, status: InquiryStatus) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return { error: "Niet ingelogd" };

  // Verify ownership via property
  const inquiry = await prisma.propertyInquiry.findFirst({
    where: {
      id: inquiryId,
      property: { createdById: session.user.id },
    },
  });

  if (!inquiry) return { error: "Aanvraag niet gevonden" };

  await prisma.propertyInquiry.update({
    where: { id: inquiryId },
    data: {
      status,
      ...(status === "CONTACTED" ? { lastContactAt: new Date() } : {}),
    },
  });

  return { success: true, data: undefined };
}
