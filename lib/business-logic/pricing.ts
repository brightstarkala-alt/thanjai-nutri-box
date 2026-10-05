export function calculateOrderTotal(
  items: { unitPrice: number; quantity: number }[]
): number {
  return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}
