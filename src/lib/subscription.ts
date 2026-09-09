export type SubscriptionType = "full_term" | "70_trips" | "weekly" | "top_student_offer";
export type PaymentStatus = "paid_full" | "installment_pending";
export type InstallmentStatus = "none" | "pending_second" | "completed";

/**
 * Maps the roster sheet's plan-choice column text to our stored
 * subscription_type + payment_status + installment_status, plus a
 * trips_total override for plans that come with a fixed trip count.
 *
 * Keyword-based (substring) rather than exact-match on purpose: real
 * sheet values vary in phrasing/whitespace ("70 رحلة" vs "٧٠ رحلة" vs
 * "باقة 70 رحلة"), and an exact match silently falls through to a
 * hardcoded default the moment the wording differs at all.
 */
export function mapSubscriptionChoice(raw: string): {
  subscription_type: SubscriptionType;
  payment_status: PaymentStatus;
  installment_status: InstallmentStatus;
  trips_total?: number;
} {
  const v = raw.trim();

  let subscription_type: SubscriptionType = "full_term";
  let trips_total: number | undefined;
  if (v.includes("70") || v.includes("٧٠") || v.includes("رحلة")) {
    subscription_type = "70_trips";
    trips_total = 70;
  } else if (v.includes("أسبوعي") || v.includes("اسبوعي")) {
    subscription_type = "weekly";
  } else if (v.includes("دحيحة") || v.includes("متفوق")) {
    subscription_type = "top_student_offer";
  } else if (v.includes("ترم") || v.includes("كامل")) {
    subscription_type = "full_term";
  }

  let payment_status: PaymentStatus = "paid_full";
  let installment_status: InstallmentStatus = "none";
  if (v.includes("قسط") || v.includes("متبقي") || v.includes("مؤجل")) {
    payment_status = "installment_pending";
    installment_status = "pending_second";
  } else if (v.includes("مسدد") || v.includes("كامل") || v.includes("مدفوع")) {
    payment_status = "paid_full";
  }

  return {
    subscription_type,
    payment_status,
    installment_status,
    ...(trips_total !== undefined ? { trips_total } : {}),
  };
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
      emoji: "🟣",
      label: "باقة 70 رحلة",
      className: "bg-purple-500 text-white",
    },
    installment_pending: {
      emoji: "🟡",
      label: "باقة 70 رحلة - نظام أقساط",
      className: "bg-warning text-warning-foreground",
    },
  },
  weekly: {
    paid_full: { emoji: "🔵", label: "اشتراك أسبوعي", className: "bg-blue-500 text-white" },
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

export function installmentReminderLink(opts: {
  full_name: string;
  phone: string;
  amount: number;
}): string {
  const message =
    `مرحباً ${opts.full_name} 👋\n` +
    `هذه رسالة تذكير بخصوص القسط الثاني المتبقي (${opts.amount} ج.م) لاشتراك النقل مع وليد وطلعت.\n` +
    `برجاء سداد القسط في أقرب وقت لضمان استمرار الخدمة. شكراً لتعاونكم 🙏`;
  const digits = opts.phone.replace(/\D/g, "");
  const number = digits.startsWith("20")
    ? digits
    : digits.startsWith("0")
      ? `20${digits.slice(1)}`
      : digits;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
