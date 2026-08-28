export type SubscriptionType = "full_term" | "70_trips" | "weekly" | "top_student_offer";
export type PaymentStatus = "paid_full" | "installment_pending";

/**
 * Maps the roster sheet's "برجاء" (plan choice) column to our stored
 * subscription_type + payment_status, plus a trips_total override for
 * plans that come with a fixed trip count.
 */
export function mapSubscriptionChoice(raw: string): {
  subscription_type: SubscriptionType;
  payment_status: PaymentStatus;
  trips_total?: number;
} {
  const v = raw.trim();
  if (v === "قسط") return { subscription_type: "full_term", payment_status: "installment_pending" };
  if (v === "سداد كامل") return { subscription_type: "full_term", payment_status: "paid_full" };
  if (v === "عرض الدحيحة")
    return { subscription_type: "top_student_offer", payment_status: "paid_full" };
  if (v === "70 رحلة")
    return { subscription_type: "70_trips", payment_status: "paid_full", trips_total: 70 };
  if (v === "اسبوعي") return { subscription_type: "weekly", payment_status: "paid_full" };
  return { subscription_type: "full_term", payment_status: "paid_full" };
}

export const SUBSCRIPTION_BADGES: Record<
  SubscriptionType,
  Record<PaymentStatus, { emoji: string; label: string; className: string }>
> = {
  full_term: {
    paid_full: {
      emoji: "🟢",
      label: "اشتراك ترم كامل - مسدد بالكامل",
      className: "bg-success text-success-foreground",
    },
    installment_pending: {
      emoji: "🟡",
      label: "اشتراك ترم - نظام أقساط",
      className: "bg-warning text-warning-foreground",
    },
  },
  "70_trips": {
    paid_full: {
      emoji: "🔵",
      label: "باقة 70 رحلة",
      className: "bg-accent text-accent-foreground",
    },
    installment_pending: {
      emoji: "🟡",
      label: "باقة 70 رحلة - نظام أقساط",
      className: "bg-warning text-warning-foreground",
    },
  },
  weekly: {
    paid_full: { emoji: "⚪", label: "اشتراك أسبوعي", className: "bg-muted text-muted-foreground" },
    installment_pending: {
      emoji: "🟡",
      label: "اشتراك أسبوعي - نظام أقساط",
      className: "bg-warning text-warning-foreground",
    },
  },
  top_student_offer: {
    paid_full: {
      emoji: "🟣",
      label: "عرض الطالب المتفوق",
      className: "bg-accent text-accent-foreground",
    },
    installment_pending: {
      emoji: "🟡",
      label: "عرض الطالب المتفوق - نظام أقساط",
      className: "bg-warning text-warning-foreground",
    },
  },
};

export function subscriptionBadge(subscriptionType: string, paymentStatus: string) {
  const st = (SUBSCRIPTION_BADGES[subscriptionType as SubscriptionType] ??
    SUBSCRIPTION_BADGES.full_term)!;
  return st[paymentStatus as PaymentStatus] ?? st.paid_full;
}
