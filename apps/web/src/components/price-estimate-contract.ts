export type EstimateRequest = {
  serviceSlug: string;
  packageId?: string;
  priority: "normal" | "urgent";
};

type Money = {
  base_price: number;
  surcharge_pct: number;
  surcharge_amount: number;
  final_price: number;
};
export type PriceEstimate =
  | ({ status: "estimated" } & Money)
  | { status: "quote_required" };

export function estimateRequest(
  serviceSlug: string | undefined,
  packageId: string,
  urgency: string,
): EstimateRequest | null {
  // Existing order urgency is NOT the new pricing priority enum. Never map
  // low/high to a tariff or silently enable same-day ordering here.
  if (!serviceSlug || (urgency !== "normal" && urgency !== "urgent")) return null;
  return {
    serviceSlug,
    ...(packageId ? { packageId } : {}),
    priority: urgency,
  };
}

export function readPriceEstimate(
  value: unknown,
  request: EstimateRequest,
): PriceEstimate {
  const invalid = () => new Error("پاسخ برآورد معتبر نیست؛ دوباره تلاش کنید.");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const data = value as Record<string, unknown>;
  if (
    data.policy_version !== "zeus-estimate-v1" ||
    data.currency !== "IRT" ||
    data.service_slug !== request.serviceSlug ||
    data.package_id !== (request.packageId ?? null) ||
    data.priority !== request.priority ||
    data.is_binding !== false ||
    data.payment_allowed !== false ||
    data.availability !== "not_checked" ||
    data.capacity_reserved !== false ||
    data.requires_operational_confirmation !== true
  ) throw invalid();
  const fields = ["base_price", "surcharge_pct", "surcharge_amount", "final_price"] as const;
  if (data.status === "quote_required") {
    if (!fields.every((field) => data[field] === null)) throw invalid();
    return { status: "quote_required" };
  }
  if (
    data.status !== "estimated" ||
    !fields.every((field) => typeof data[field] === "number" && Number.isInteger(data[field]) && data[field] >= 0 && data[field] <= 2_147_483_647)
  ) throw invalid();
  const money = Object.fromEntries(fields.map((field) => [field, data[field]])) as Money;
  // Validate the response, not a replacement local price calculation.
  const percent = request.priority === "urgent" ? 30 : 0;
  if (
    money.surcharge_pct !== percent ||
    money.surcharge_amount !== Math.floor((money.base_price * percent) / 100) ||
    money.final_price !== money.base_price + money.surcharge_amount
  ) throw invalid();
  return { status: "estimated", ...money };
}
