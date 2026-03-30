"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import type { ActionResult } from "@/types/actions";
import {
  createNoteSchema,
  updateNoteSchema,
  deleteNoteSchema,
  listNotesSchema,
  createProjectFileSchema,
  deleteProjectFileSchema,
  type CreateNoteInput,
  type UpdateNoteInput,
  type DeleteNoteInput,
  type ListNotesInput,
  type CreateProjectFileInput,
  type DeleteProjectFileInput,
} from "@/lib/validations/note";

// ============================================
// HELPER FUNCTIONS
// ============================================

type SessionContextResult =
  | { success: true; data: { userId: string; workspaceId: string; workspaceRole: string } }
  | { success: false; error: string };

/**
 * Get current user's session and active workspace
 */
async function getSessionContext(): Promise<SessionContextResult> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "No active session" };
    }

    // Get user's active workspace or first workspace
    const member = await prisma.workspaceMember.findFirst({
      where: { userId: session.user.id },
      include: { workspace: true },
      orderBy: { joinedAt: "asc" },
    });

    if (!member) {
      return { success: false, error: "User has no workspace membership" };
    }

    return {
      success: true,
      data: {
        userId: session.user.id,
        workspaceId: member.workspace.id,
        workspaceRole: member.role,
      },
    };
  } catch (error) {
    console.error("getSessionContext error:", error);
    return { success: false, error: "Session context error" };
  }
}

/**
 * Check if user has permission to modify a project
 */
async function canModifyProject(
  userId: string,
  projectId: string
): Promise<{ allowed: boolean; isOwner: boolean }> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      createdById: true,
      members: {
        where: { userId },
        select: { role: true, access: true },
      },
    },
  });

  if (!project) {
    return { allowed: false, isOwner: false };
  }

  const isCreator = project.createdById === userId;
  const membership = project.members[0];

  // Creator always has access
  if (isCreator) {
    return { allowed: true, isOwner: true };
  }

  // Check member role
  if (membership) {
    const canEdit =
      membership.access === "FULL_ACCESS" || membership.access === "CAN_EDIT";
    const isOwnerOrPIC =
      membership.role === "OWNER" || membership.role === "PIC";
    return { allowed: canEdit || isOwnerOrPIC, isOwner: isOwnerOrPIC };
  }

  return { allowed: false, isOwner: false };
}

// ============================================
// RESPONSE TYPES
// ============================================

interface NoteItem {
  id: string;
  title: string;
  content: string | null;
  noteType: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
  };
}

interface FileItem {
  id: string;
  name: string;
  url: string;
  size: number;
  type: string;
  uploadedAt: Date;
  uploadedBy: {
    id: string;
    name: string | null;
    email: string;
  };
}

// ============================================
// NOTE CRUD OPERATIONS
// ============================================

/**
 * Create a new note in a project
 */
export async function createNote(
  input: CreateNoteInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    // Validate input
    const validatedData = createNoteSchema.parse(input);

    // Check permission
    const { allowed } = await canModifyProject(ctx.userId, validatedData.projectId);
    if (!allowed) {
      return { success: false, error: "Permission denied" };
    }

    const note = await prisma.projectNote.create({
      data: {
        projectId: validatedData.projectId,
        createdById: ctx.userId,
        title: validatedData.title,
        content: validatedData.content || null,
        noteType: validatedData.noteType,
      },
    });

    revalidatePath(`/dashboard/projects/${validatedData.projectId}`);

    return { success: true, data: { id: note.id } };
  } catch (error: unknown) {
    console.error("Error creating note:", error);

    if (error instanceof Error && error.name === "ZodError") {
      return {
        success: false,
        error: (error as any).issues[0]?.message ?? "Validation failed",
      };
    }

    return { success: false, error: "Failed to create note" };
  }
}

/**
 * Update an existing note
 */
export async function updateNote(
  input: UpdateNoteInput
): Promise<ActionResult<void>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    // Validate input
    const validatedData = updateNoteSchema.parse(input);

    // Look up note to get projectId
    const note = await prisma.projectNote.findUnique({
      where: { id: validatedData.id },
      select: { projectId: true },
    });

    if (!note) {
      return { success: false, error: "Note not found" };
    }

    // Check permission
    const { allowed } = await canModifyProject(ctx.userId, note.projectId);
    if (!allowed) {
      return { success: false, error: "Permission denied" };
    }

    // Build update data (only include fields that are defined)
    const updateData: Record<string, string | null> = {};
    if (validatedData.title !== undefined) updateData.title = validatedData.title;
    if (validatedData.content !== undefined) updateData.content = validatedData.content ?? null;

    await prisma.projectNote.update({
      where: { id: validatedData.id },
      data: updateData,
    });

    revalidatePath(`/dashboard/projects/${note.projectId}`);

    return { success: true, data: undefined };
  } catch (error: unknown) {
    console.error("Error updating note:", error);

    if (error instanceof Error && error.name === "ZodError") {
      return {
        success: false,
        error: (error as any).issues[0]?.message ?? "Validation failed",
      };
    }

    return { success: false, error: "Failed to update note" };
  }
}

/**
 * Delete a note
 */
export async function deleteNote(
  input: DeleteNoteInput
): Promise<ActionResult<void>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    // Validate input
    const validatedData = deleteNoteSchema.parse(input);

    // Look up note to get projectId
    const note = await prisma.projectNote.findUnique({
      where: { id: validatedData.id },
      select: { projectId: true },
    });

    if (!note) {
      return { success: false, error: "Note not found" };
    }

    // Check permission
    const { allowed } = await canModifyProject(ctx.userId, note.projectId);
    if (!allowed) {
      return { success: false, error: "Permission denied" };
    }

    await prisma.projectNote.delete({
      where: { id: validatedData.id },
    });

    revalidatePath(`/dashboard/projects/${note.projectId}`);

    return { success: true, data: undefined };
  } catch (error: unknown) {
    console.error("Error deleting note:", error);

    return { success: false, error: "Failed to delete note" };
  }
}

/**
 * List all notes for a project
 */
export async function listNotes(
  input: ListNotesInput
): Promise<ActionResult<NoteItem[]>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }

    // Validate input
    const validatedData = listNotesSchema.parse(input);

    const notes = await prisma.projectNote.findMany({
      where: { projectId: validatedData.projectId },
      include: {
        createdBy: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const items: NoteItem[] = notes.map((n) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      noteType: n.noteType,
      status: n.status,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      createdBy: n.createdBy,
    }));

    return { success: true, data: items };
  } catch (error: unknown) {
    console.error("Error listing notes:", error);

    if (error instanceof Error && error.name === "ZodError") {
      return {
        success: false,
        error: (error as any).issues[0]?.message ?? "Validation failed",
      };
    }

    return { success: false, error: "Failed to load notes" };
  }
}

// ============================================
// PROJECT FILE OPERATIONS
// ============================================

/**
 * Create a new project file record
 */
export async function createProjectFile(
  input: CreateProjectFileInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    // Validate input
    const validatedData = createProjectFileSchema.parse(input);

    // Check permission
    const { allowed } = await canModifyProject(ctx.userId, validatedData.projectId);
    if (!allowed) {
      return { success: false, error: "Permission denied" };
    }

    const file = await prisma.projectFile.create({
      data: {
        projectId: validatedData.projectId,
        uploadedById: ctx.userId,
        name: validatedData.name,
        url: validatedData.url,
        size: validatedData.size,
        type: validatedData.type,
      },
    });

    revalidatePath(`/dashboard/projects/${validatedData.projectId}`);

    return { success: true, data: { id: file.id } };
  } catch (error: unknown) {
    console.error("Error creating project file:", error);

    if (error instanceof Error && error.name === "ZodError") {
      return {
        success: false,
        error: (error as any).issues[0]?.message ?? "Validation failed",
      };
    }

    return { success: false, error: "Failed to create project file" };
  }
}

/**
 * Delete a project file
 */
export async function deleteProjectFile(
  input: DeleteProjectFileInput
): Promise<ActionResult<void>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }
    const ctx = ctxResult.data;

    // Validate input
    const validatedData = deleteProjectFileSchema.parse(input);

    // Look up file to get projectId
    const file = await prisma.projectFile.findUnique({
      where: { id: validatedData.id },
      select: { projectId: true },
    });

    if (!file) {
      return { success: false, error: "File not found" };
    }

    // Check permission
    const { allowed } = await canModifyProject(ctx.userId, file.projectId);
    if (!allowed) {
      return { success: false, error: "Permission denied" };
    }

    await prisma.projectFile.delete({
      where: { id: validatedData.id },
    });

    revalidatePath(`/dashboard/projects/${file.projectId}`);

    return { success: true, data: undefined };
  } catch (error: unknown) {
    console.error("Error deleting project file:", error);

    return { success: false, error: "Failed to delete project file" };
  }
}

/**
 * List all files for a project
 */
export async function listProjectFiles(
  projectId: string
): Promise<ActionResult<FileItem[]>> {
  try {
    const ctxResult = await getSessionContext();
    if (!ctxResult.success) {
      return { success: false, error: ctxResult.error };
    }

    const files = await prisma.projectFile.findMany({
      where: { projectId },
      include: {
        uploadedBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { uploadedAt: "desc" },
    });

    const items: FileItem[] = files.map((f) => ({
      id: f.id,
      name: f.name,
      url: f.url,
      size: f.size,
      type: f.type,
      uploadedAt: f.uploadedAt,
      uploadedBy: f.uploadedBy,
    }));

    return { success: true, data: items };
  } catch (error: unknown) {
    console.error("Error listing project files:", error);

    return { success: false, error: "Failed to load project files" };
  }
}
