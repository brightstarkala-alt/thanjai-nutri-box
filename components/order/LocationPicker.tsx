"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { MapPin } from "lucide-react";
import type { PickedLocation } from "@/components/order/MapPicker";

// The map (Leaflet + its CSS) loads only when the customer opens it.
const MapPicker = dynamic(() => import("@/components/order/MapPicker").then((m) => m.MapPicker), { ssr: false });

export type DeliveryPin = { latitude: number; longitude: number; label: string | null };

// Optional: pick the exact delivery spot on a map. The typed address stays
// the customer's to edit; a looked-up address only fills it when it's empty
// (otherwise it's offered as a suggestion).
export function LocationPicker({
  pin,
  address,
  onPinChange,
  onUseAddress,
}: {
  pin: DeliveryPin | null;
  address: string;
  /** address: the looked-up address to fill in (only when the field was empty). */
  onPinChange: (pin: DeliveryPin | null, address?: string) => void;
  onUseAddress: (address: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  function onConfirm(loc: PickedLocation) {
    setOpen(false);
    const pin = { latitude: loc.lat, longitude: loc.lng, label: loc.label };
    // One update for pin + address, so neither overwrites the other.
    if (loc.address && !address.trim()) {
      onPinChange(pin, loc.address);
      setSuggestion(null);
    } else {
      onPinChange(pin);
      setSuggestion(loc.address && loc.address !== address.trim() ? loc.address : null);
    }
  }

  return (
    <div>
      {pin ? (
        <div className="rounded-xl bg-leaf-soft/60 p-3 ring-1 ring-leaf/30" data-testid="location-selected">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-leaf-deep">
            <MapPin className="size-4" /> Location selected
          </p>
          <p className="mt-0.5 text-sm text-ink">{pin.label ?? `${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}`}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            <button type="button" onClick={() => setOpen(true)} className="font-medium text-leaf-deep underline underline-offset-2">
              Change location
            </button>
            <button
              type="button"
              onClick={() => {
                onPinChange(null);
                setSuggestion(null);
              }}
              className="text-ink-soft underline underline-offset-2"
            >
              Remove
            </button>
          </div>
          {suggestion && (
            <div className="mt-2 rounded-lg bg-surface p-2 text-sm">
              <p className="text-ink-soft">Address for this location:</p>
              <p className="text-ink">{suggestion}</p>
              <button
                type="button"
                onClick={() => {
                  onUseAddress(suggestion);
                  setSuggestion(null);
                }}
                className="mt-1 font-medium text-leaf-deep underline underline-offset-2"
              >
                Use this address
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-soft bg-surface-strong px-4 text-sm font-medium text-ink transition-colors hover:bg-leaf-soft"
        >
          <MapPin className="size-4 text-leaf" /> Choose location on map
          <span className="font-normal text-ink-soft">(optional)</span>
        </button>
      )}
      {open && (
        <MapPicker
          initial={pin ? { lat: pin.latitude, lng: pin.longitude } : null}
          onConfirm={onConfirm}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
