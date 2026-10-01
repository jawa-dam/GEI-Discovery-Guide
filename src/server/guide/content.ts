import "server-only";
import { DISCOVERY_PREMIUM } from "@/lib/catalog";
import { requireEntitlement } from "../authz";

/*
 * Premium data-access layer. Every accessor enforces the entitlement
 * itself, so premium data can only reach a response that passed the
 * authorization authority — no page can forget the check.
 *
 * V1.0 holds the navigation architecture only. Gate content arrives in
 * the next guide build; nothing here is course content.
 */

export interface Gate {
  id: string;
  code: string;
  title: string;
  status: "coming";
  final?: boolean;
}

const GATES: readonly Gate[] = [
  { id: "enter-the-system", code: "01", title: "Enter the System", status: "coming" },
  { id: "train-your-eyes", code: "02", title: "Train Your Eyes", status: "coming" },
  { id: "decode-the-language", code: "03", title: "Decode the Language", status: "coming" },
  { id: "think-in-systems", code: "04", title: "Think in Systems", status: "coming" },
  { id: "enter-genesis", code: "05", title: "Enter Genesis", status: "coming" },
  { id: "run-the-gei-method", code: "06", title: "Run the GEI Method", status: "coming" },
  { id: "investigator-missions", code: "07", title: "Investigator Missions", status: "coming" },
  { id: "build-your-gei-model", code: "08", title: "Build Your GEI Model", status: "coming" },
  { id: "discovery-certification", code: "FINAL", title: "Discovery Certification", status: "coming", final: true }
];

export const GATE_STATUS_LABEL = "COMING IN GUIDE BUILD";

export async function loadRoadmap(path: string) {
  const access = await requireEntitlement(DISCOVERY_PREMIUM, path);
  return {
    gates: GATES,
    grantedAt: access.entitlement.grantedAt,
    productId: access.entitlement.productId
  };
}
