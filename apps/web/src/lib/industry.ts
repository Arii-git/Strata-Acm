/** Industry wording for the signed-in company (matches data/profiles.py on the engine). */
import { useAuth } from "@/lib/auth";

export type IndustryKey = "pharma" | "fmcg" | "logistics";

export function industryKey(industry?: string | null): IndustryKey {
  const s = (industry ?? "").toLowerCase();
  if (s.includes("fmcg") || s.includes("consumer")) return "fmcg";
  if (s.includes("logistic") || s.includes("freight")) return "logistics";
  return "pharma";
}

interface Wording {
  /** account type key -> plural label for the channel diagram */
  channel: Record<string, string>;
  /** the box upstream of the first channel tier */
  source: string;
  customer: string;
}

export const WORDING: Record<IndustryKey, Wording> = {
  pharma: {
    channel: { stockist: "Stockists", chemist_chain: "Chemist chains", hospital_pharmacy: "Hospital pharmacies", nephrology_clinic: "Clinics (nephrology)" },
    source: "Manufacturer",
    customer: "A customer is a B2B channel account of a pharma distributor: stockist, chemist chain, hospital pharmacy or clinic. No patient data is used.",
  },
  fmcg: {
    channel: { stockist: "Distributors", chemist_chain: "Modern trade chains", hospital_pharmacy: "HoReCa accounts", nephrology_clinic: "General trade outlets" },
    source: "Brand owner",
    customer: "A customer is a B2B channel account of a consumer-goods company: distributor, modern trade chain, HoReCa account or general trade outlet.",
  },
  logistics: {
    channel: { stockist: "Enterprise shippers", chemist_chain: "E-commerce clients", hospital_pharmacy: "Cold-chain clients", nephrology_clinic: "SME shippers" },
    source: "Network",
    customer: "A customer is a B2B shipper using the logistics network: enterprise shipper, e-commerce client, cold-chain client or SME shipper.",
  },
};

export function useWording(): Wording {
  const { user } = useAuth();
  return WORDING[industryKey(user?.company_industry)];
}
