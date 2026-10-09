import {
  IconHeadset, IconPlugConnectedX, IconReceiptRupee, IconRoute, IconShieldHalf, IconTrendingUp, IconTruckDelivery,
  IconUsers, type Icon,
} from "@tabler/icons-react";
import { CATEGORY, type CategoryKey } from "@config/taxonomy";

export const CATEGORY_ICON: Record<CategoryKey, Icon> = {
  supply: IconTruckDelivery, service: IconHeadset, customer: IconUsers, finance: IconReceiptRupee,
  field: IconRoute, quality: IconShieldHalf, data: IconPlugConnectedX, opportunity: IconTrendingUp,
};

/** Category = icon + label (never colour alone). */
export function CategoryChip({ category, size = "md" }: { category: string; size?: "sm" | "md" }) {
  const key = (category in CATEGORY ? category : "customer") as CategoryKey;
  const Ico = CATEGORY_ICON[key];
  return (
    <span className={`category-chip category-chip--${key}${size === "sm" ? " category-chip--sm" : ""}`} data-testid="category-chip" title={CATEGORY[key].meaning}>
      <Ico size={size === "sm" ? 14 : 16} stroke={1.5} aria-hidden="true" />
      {CATEGORY[key].label}
    </span>
  );
}

export function CategoryIcon({ category, size = 20 }: { category: string; size?: number }) {
  const key = (category in CATEGORY ? category : "customer") as CategoryKey;
  const Ico = CATEGORY_ICON[key];
  return <Ico size={size} stroke={1.5} aria-hidden="true" />;
}
