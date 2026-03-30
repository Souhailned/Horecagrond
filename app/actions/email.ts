"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { sendTemplateEmail, isValidEmail } from "@/lib/notifications/email-service";
import { EmailTemplateId } from "@/lib/notifications/types";
import type { ActionResult } from "@/types/actions";
import type { EmailTemplateData, SendEmailOptions } from "@/lib/notifications/types";

/**
 * Helper to check if user is authenticated
 */
async function checkAuthentication(): Promise<ActionResult<boolean>> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized - Not authenticated" };
    }

    return { success: true, data: true };
  } catch (error) {
    console.error("Error checking authentication:", error);
    return { success: false, error: "Failed to verify authentication" };
  }
}

/**
 * Send welcome email to a new user
 *
 * @param data - Welcome email template data
 * @param to - Recipient email address
 * @returns Promise with action result containing email ID
 */
export async function sendWelcomeEmail(
  data: EmailTemplateData[EmailTemplateId.WORKSPACE_WELCOME],
  to: string
): Promise<ActionResult<{ emailId: string }>> {
  const authCheck = await checkAuthentication();
  if (!authCheck.success) {
    return { success: false, error: authCheck.error };
  }

  if (!isValidEmail(to)) {
    return { success: false, error: "Invalid email address" };
  }

  try {
    const result = await sendTemplateEmail(
      EmailTemplateId.WORKSPACE_WELCOME,
      data,
      { to }
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error ?? "Failed to send welcome email",
      };
    }

    return {
      success: true,
      data: { emailId: result.id },
    };
  } catch (error) {
    console.error("Failed to send welcome email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send welcome email",
    };
  }
}

/**
 * Send workspace invitation email
 *
 * @param data - Workspace invitation template data
 * @param to - Recipient email address
 * @returns Promise with action result containing email ID
 */
export async function sendWorkspaceInvitationEmail(
  data: EmailTemplateData[EmailTemplateId.WORKSPACE_INVITATION],
  to: string
): Promise<ActionResult<{ emailId: string }>> {
  const authCheck = await checkAuthentication();
  if (!authCheck.success) {
    return { success: false, error: authCheck.error };
  }

  if (!isValidEmail(to)) {
    return { success: false, error: "Invalid email address" };
  }

  try {
    const result = await sendTemplateEmail(
      EmailTemplateId.WORKSPACE_INVITATION,
      data,
      { to }
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error ?? "Failed to send workspace invitation email",
      };
    }

    return {
      success: true,
      data: { emailId: result.id },
    };
  } catch (error) {
    console.error("Failed to send workspace invitation email:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to send workspace invitation email",
    };
  }
}

/**
 * Send email verification email
 *
 * @param data - Email verification template data
 * @param to - Recipient email address
 * @returns Promise with action result containing email ID
 */
export async function sendEmailVerification(
  data: EmailTemplateData[EmailTemplateId.EMAIL_VERIFICATION],
  to: string
): Promise<ActionResult<{ emailId: string }>> {
  // Note: Email verification emails should be sent without authentication
  // since the user may not be logged in yet
  if (!isValidEmail(to)) {
    return { success: false, error: "Invalid email address" };
  }

  try {
    const result = await sendTemplateEmail(
      EmailTemplateId.EMAIL_VERIFICATION,
      data,
      { to }
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error ?? "Failed to send deal alert email",
      };
    }

    return {
      success: true,
      data: { emailId: result.id },
    };
  } catch (error) {
    console.error("Failed to send email verification:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to send email verification",
    };
  }
}

/**
 * Send password reset email
 *
 * @param data - Password reset template data
 * @param to - Recipient email address
 * @returns Promise with action result containing email ID
 */
export async function sendPasswordResetEmail(
  data: EmailTemplateData[EmailTemplateId.PASSWORD_RESET],
  to: string
): Promise<ActionResult<{ emailId: string }>> {
  // Note: Password reset emails should be sent without authentication
  // since the user may be logged out
  if (!isValidEmail(to)) {
    return { success: false, error: "Invalid email address" };
  }

  try {
    const result = await sendTemplateEmail(
      EmailTemplateId.PASSWORD_RESET,
      data,
      { to }
    );

    if (!result.success) {
      return {
        success: false,
        error: result.error ?? "Failed to send contact notification email",
      };
    }

    return {
      success: true,
      data: { emailId: result.id },
    };
  } catch (error) {
    console.error("Failed to send password reset email:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to send password reset email",
    };
  }
}

/**
 * Generic function to send any email template
 * Requires authentication for security
 *
 * @param templateId - The template to use
 * @param data - Template-specific data
 * @param options - Email sending options
 * @returns Promise with action result containing email ID
 */
export async function sendTemplateEmailAction<T extends EmailTemplateId>(
  templateId: T,
  data: EmailTemplateData[T],
  options: SendEmailOptions
): Promise<ActionResult<{ emailId: string }>> {
  const authCheck = await checkAuthentication();
  if (!authCheck.success) {
    return { success: false, error: authCheck.error };
  }

  const recipients = Array.isArray(options.to) ? options.to : [options.to];
  for (const email of recipients) {
    if (!isValidEmail(email)) {
      return { success: false, error: `Invalid email address: ${email}` };
    }
  }

  try {
    const result = await sendTemplateEmail(templateId, data, options);

    if (!result.success) {
      return {
        success: false,
        error: result.error ?? "Failed to send inquiry confirmation email",
      };
    }

    return {
      success: true,
      data: { emailId: result.id },
    };
  } catch (error) {
    console.error("Failed to send email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send email",
    };
  }
}
