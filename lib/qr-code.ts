import QRCode from "qrcode";

const QR_OPTS = {
  width: 400,
  margin: 2,
  color: { dark: "#1B5E20", light: "#FFFFFF" },
} as const;

// Payload/styling shared by the on-screen QR display and the emailed
// attachment, so both always encode the same app-onboarding link.
export async function generateOnboardingQr(token: string): Promise<{ dataUrl: string; buffer: Buffer }> {
  const serverUrl = process.env.FARMER_SERVER_URL ?? process.env.NEXTAUTH_URL ?? "";
  const payload = JSON.stringify({ url: serverUrl, token });
  const buffer = await QRCode.toBuffer(payload, QR_OPTS);
  return { dataUrl: `data:image/png;base64,${buffer.toString("base64")}`, buffer };
}
