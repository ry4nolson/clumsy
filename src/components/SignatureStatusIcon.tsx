import { Shield, ShieldAlert, ShieldBan, ShieldCheck, ShieldEllipsis, ShieldHalf, ShieldOff, ShieldQuestionMark, ShieldX } from "lucide-react";
import { statusWords } from "../lib/signatureStatus";
import type { SignatureStatus } from "../lib/signatureTypes";

const icons: Record<SignatureStatus, typeof Shield> = {
  valid: ShieldCheck,
  invalid: ShieldX,
  revoked: ShieldBan,
  expired: ShieldAlert,
  weak: ShieldOff,
  unverified: ShieldQuestionMark,
  unknown: ShieldHalf,
  unsupported: Shield,
};

export function SignatureStatusIcon({ status, size = 16 }: { status: SignatureStatus | null; size?: number }) {
  const Icon = status ? icons[status] : ShieldEllipsis;
  return <Icon size={size} className={`signature-icon ${status ? statusWords[status].tone : "neutral"}`} aria-hidden="true" />;
}
