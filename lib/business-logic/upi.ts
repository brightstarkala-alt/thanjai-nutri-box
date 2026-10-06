/**
 * UPI payment link (NPCI "upi://pay" deep link) for the business's own
 * UPI ID from business_settings.upi_id. Nothing here invents a payee: with
 * no configured UPI ID there is no link and no QR.
 */

/** name@handle, e.g. "shop.name@okaxis". */
export function isValidUpiId(value: string | null | undefined): value is string {
  return !!value && /^[A-Za-z0-9._\-]{2,256}@[A-Za-z][A-Za-z0-9.\-]{1,64}$/.test(value.trim());
}

export function buildUpiPaymentUri({
  upiId,
  payeeName,
  amount,
  note,
}: {
  upiId: string;
  payeeName: string;
  amount: number;
  note?: string;
}): string {
  const params = new URLSearchParams({
    pa: upiId.trim(),
    pn: payeeName,
    // Prefills the amount in the customer's UPI app.
    am: amount.toFixed(2),
    cu: "INR",
  });
  if (note) params.set("tn", note);
  // UPI apps expect %20 for spaces, not "+".
  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}
