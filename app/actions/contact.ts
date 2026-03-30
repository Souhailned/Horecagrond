"use server";

import { contactFormSchema } from "@/lib/validations/contact";
import type { ActionResult } from "@/types/actions";

export async function submitContactForm(formData: FormData): Promise<ActionResult> {
  try {
    // 1. Extract and validate with Zod
    const raw = {
      name: formData.get("name"),
      email: formData.get("email"),
      subject: formData.get("subject"),
      message: formData.get("message"),
    };

    const validated = contactFormSchema.safeParse(raw);
    if (!validated.success) {
      return { success: false, error: validated.error.issues[0].message };
    }
    const data = validated.data;

    // 2. Business logic — log for now, send email via Resend in production
    console.log("[Contact Form]", {
      name: data.name,
      email: data.email,
      subject: data.subject,
      message: data.message,
    });

    // For production: await sendEmail({ to: "info@horecagrond.nl", subject: `Contact: ${data.subject}`, ... })

    return { success: true, data: undefined };
  } catch (error) {
    console.error("Contact form error:", error);
    return { success: false, error: "Er ging iets mis. Probeer het later opnieuw." };
  }
}
