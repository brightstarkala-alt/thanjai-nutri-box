"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Check, Crosshair, LoaderCircle, Search, X } from "lucide-react";
import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, Marker } from "leaflet";
import { lookupAddress, searchPlaces, THANJAVUR, type GeoResult, type LatLng } from "@/lib/geo/nominatim";

export type PickedLocation = LatLng & { label: string | null; address: string | null };

const PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44"><path d="M17 0C7.6 0 0 7.5 0 16.8 0 29.4 17 44 17 44s17-14.6 17-27.2C34 7.5 26.4 0 17 0z" fill="#2f6b3a"/><circle cx="17" cy="17" r="6.5" fill="#fff"/></svg>`;

// Full-screen (mobile) / dialog (desktop) map: search, "use my current
// location" (only if the customer allows it), tap or drag to place the pin,
// then confirm. OpenStreetMap tiles via Leaflet — no API key.
export function MapPicker({
  initial,
  onConfirm,
  onClose,
}: {
  initial: LatLng | null;
  onConfirm: (loc: PickedLocation) => void;
  onClose: () => void;
}) {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [pin, setPin] = useState<LatLng>(initial ?? THANJAVUR);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapEl.current || mapRef.current) return;
      const start = initial ?? THANJAVUR;
      const map = L.map(mapEl.current, { zoomControl: true }).setView([start.lat, start.lng], initial ? 17 : 13);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      const marker = L.marker([start.lat, start.lng], {
        draggable: true,
        keyboard: true,
        title: "Delivery location — drag to adjust",
        icon: L.divIcon({ className: "", html: PIN_SVG, iconSize: [34, 44], iconAnchor: [17, 44] }),
      }).addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        setPin({ lat: p.lat, lng: p.lng });
      });
      map.on("click", (e) => {
        marker.setLatLng(e.latlng);
        setPin({ lat: e.latlng.lat, lng: e.latlng.lng });
      });
      mapRef.current = map;
      markerRef.current = marker;
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // The map is created once; later pin changes move the marker directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function moveTo(p: LatLng, zoom = 17) {
    setPin(p);
    markerRef.current?.setLatLng([p.lat, p.lng]);
    mapRef.current?.setView([p.lat, p.lng], zoom);
  }

  async function search(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setNote(null);
    try {
      const found = await searchPlaces(query.trim());
      setResults(found);
      if (found.length === 0) setNote("No places found. Try a nearby landmark or street name, or move the pin.");
    } catch {
      setNote("Search isn't available right now. You can move the pin on the map instead.");
    } finally {
      setSearching(false);
    }
  }

  function useCurrentLocation() {
    if (!("geolocation" in navigator)) {
      setNote("Your browser can't share its location. Search or move the pin instead.");
      return;
    }
    setLocating(true);
    setNote(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        moveTo({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 18);
        setNote("Moved to your current location — adjust the pin if needed.");
      },
      (err) => {
        setLocating(false);
        setNote(
          err.code === err.PERMISSION_DENIED
            ? "Location permission wasn't allowed. That's fine — search for your area or move the pin."
            : "Couldn't get your location. Search for your area or move the pin."
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  async function confirm() {
    setConfirming(true);
    const found = await lookupAddress(pin);
    setConfirming(false);
    onConfirm({ ...pin, label: found?.label ?? null, address: found?.address ?? null });
  }

  // Portalled to <body>: the Review step's entry animation leaves a transform
  // on its section, which would otherwise trap this fixed overlay inside it.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-ink/40 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Choose delivery location">
      <div className="flex h-full w-full flex-col bg-canvas sm:h-[85vh] sm:max-w-3xl sm:overflow-hidden sm:rounded-2xl sm:ring-1 sm:ring-line-soft">
        <div className="flex items-center justify-between gap-3 border-b border-line-soft bg-surface px-4 py-3">
          <h2 className="font-serif text-lg font-semibold text-ink">Choose delivery location</h2>
          <button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-full text-ink-soft hover:bg-surface-muted" aria-label="Close map">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-2 border-b border-line-soft bg-surface px-4 py-3">
          <form onSubmit={search} className="flex gap-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search area, street or landmark"
              aria-label="Search location"
              className="block w-full rounded-xl border border-line-soft bg-surface-strong px-3 py-2.5 text-base text-ink placeholder:text-ink-soft/60 focus:border-leaf focus:outline-none focus:ring-2 focus:ring-leaf/25"
            />
            <button type="submit" disabled={searching} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-leaf px-4 text-sm font-medium text-on-leaf hover:bg-leaf-deep disabled:opacity-50">
              {searching ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />} Search
            </button>
          </form>
          <button type="button" onClick={useCurrentLocation} disabled={locating} className="inline-flex items-center gap-1.5 text-sm font-medium text-leaf-deep underline underline-offset-2 disabled:opacity-60">
            {locating ? <LoaderCircle className="size-4 animate-spin" /> : <Crosshair className="size-4" />} Use my current location
          </button>
          {results && results.length > 0 && (
            <ul className="max-h-40 divide-y divide-line-soft overflow-auto rounded-xl bg-surface-strong ring-1 ring-line-soft" aria-label="Search results">
              {results.map((r, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => {
                      moveTo(r);
                      setResults(null);
                      setNote("Adjust the pin to your exact gate or door if needed.");
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-leaf-soft"
                  >
                    <span className="font-medium text-ink">{r.label}</span>
                    <span className="block truncate text-xs text-ink-soft">{r.address}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {note && (
            <p className="text-sm text-ink-soft" role="status">
              {note}
            </p>
          )}
        </div>

        <div ref={mapEl} className="min-h-0 flex-1 bg-surface-muted" data-testid="delivery-map" />

        <div className="flex items-center justify-between gap-3 border-t border-line-soft bg-surface px-4 py-3">
          <p className="text-xs text-ink-soft">Tap the map or drag the pin to your exact location.</p>
          <button type="button" onClick={confirm} disabled={confirming} className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-leaf px-5 text-base font-medium text-on-leaf hover:bg-leaf-deep disabled:opacity-60">
            {confirming ? <LoaderCircle className="size-5 animate-spin" /> : <Check className="size-5" />} Confirm location
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
