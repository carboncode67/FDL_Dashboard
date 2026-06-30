import { prisma } from "@/lib/prisma";

// Fallback used the first time this is read, before any admin has saved
// a custom version through the Admin Panel. Keep this in sync with whatever
// the WhatsApp/Messaging onboarding flow used to hardcode.
export const DEFAULT_ONBOARDING_MESSAGE = `This number is monitored weekly — not suitable for urgent matters.

Welcome to the Farmers Datalab! Use this number to document your on-farm experiment — send observations, photos, voice notes, videos, soil reports, location pins, or any other field data.

Please avoid sending sensitive personal or financial information (IDs, banking details, passwords).

By using this service you acknowledge that WhatsApp and Twilio process messages as part of their infrastructure. We do not share your data with any other party.

Your participation is voluntary. Reply with your name to get started.`;

export async function getOnboardingMessage(): Promise<string> {
  try {
    const row = await prisma.siteConfig.findUnique({ where: { key: "onboarding_message" } });
    return row?.value || DEFAULT_ONBOARDING_MESSAGE;
  } catch {
    return DEFAULT_ONBOARDING_MESSAGE;
  }
}

export async function setOnboardingMessage(message: string): Promise<void> {
  await prisma.siteConfig.upsert({
    where: { key: "onboarding_message" },
    update: { value: message },
    create: { key: "onboarding_message", value: message },
  });
}
