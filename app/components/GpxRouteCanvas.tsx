"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import type { DashboardRunner, GpxPoint } from "../../lib/types";

const DEFAULT_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const DEFAULT_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export function GpxRouteCanvas({ points, label, runners = [] }: { points: GpxPoint[]; label: string; runners?: DashboardRunner[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const runnersLayerRef = useRef<LayerGroup | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const [ready, setReady] = useState(false);
  const center = useMemo(() => {
    if (!points.length) return null;
    return {
      lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length,
      lon: points.reduce((sum, point) => sum + point.lon, 0) / points.length,
    };
  }, [points]);

  useEffect(() => {
    if (!containerRef.current || points.length < 2) return;
    let cancelled = false;
    void import("leaflet").then((module) => {
      if (cancelled || !containerRef.current) return;
      const L = module.default;
      leafletRef.current = L;
      const map = L.map(containerRef.current, { scrollWheelZoom: false, zoomControl: false });
      mapRef.current = map;
      L.control.zoom({ position: "topright" }).addTo(map);
      L.tileLayer(process.env.NEXT_PUBLIC_MAP_TILE_URL || DEFAULT_TILE_URL, {
        attribution: process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || DEFAULT_ATTRIBUTION,
        maxZoom: 19,
        noWrap: true,
      }).addTo(map);
      const latLngs = points.map((point) => L.latLng(point.lat, point.lon));
      const shadow = L.polyline(latLngs, { color: "#151714", opacity: 0.8, weight: 9, lineJoin: "round" }).addTo(map);
      L.polyline(latLngs, { color: "#c8f05b", opacity: 1, weight: 5, lineJoin: "round" }).addTo(map);
      L.circleMarker(latLngs[0], { radius: 8, color: "#151714", weight: 3, fillColor: "#fbfaf6", fillOpacity: 1 })
        .bindTooltip("Départ / arrivée", { permanent: false, direction: "right" }).addTo(map);
      runnersLayerRef.current = L.layerGroup().addTo(map);
      map.fitBounds(shadow.getBounds(), { padding: [36, 36], maxZoom: 16 });
      window.setTimeout(() => map.invalidateSize(), 0);
      setReady(true);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      runnersLayerRef.current = null;
      leafletRef.current = null;
    };
  }, [points]);

  useEffect(() => {
    const L = leafletRef.current;
    const layer = runnersLayerRef.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();
    const freshnessLimit = Date.now() - 5 * 60 * 1000;
    for (const runner of runners) {
      const position = runner.livePosition;
      if (!position || position.recordedAt < freshnessLimit) continue;
      const latLng = L.latLng(position.latitude, position.longitude);
      if (position.accuracyM <= 150) {
        L.circle(latLng, {
          radius: position.accuracyM,
          color: "#161814",
          weight: 1,
          opacity: 0.22,
          fillColor: "#c8f05b",
          fillOpacity: 0.08,
          interactive: false,
        }).addTo(layer);
      }
      L.circleMarker(latLng, {
        radius: 9,
        color: "#161814",
        weight: 3,
        fillColor: "#ff7456",
        fillOpacity: 1,
      })
        .bindTooltip(`#${runner.bib} · ${runner.name}`, { permanent: true, direction: "top", className: "runner-map-tooltip" })
        .bindPopup(`<b>#${runner.bib} · ${escapeHtml(runner.name)}</b><br>Position reçue à ${new Date(position.recordedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}<br>Précision ± ${Math.round(position.accuracyM)} m`)
        .addTo(layer);
    }
  }, [ready, runners]);

  if (points.length < 2) return <div className="gpx-map-empty">Tracé GPX indisponible.</div>;
  const osmLink = center ? `https://www.openstreetmap.org/#map=14/${center.lat.toFixed(5)}/${center.lon.toFixed(5)}` : "https://www.openstreetmap.org";
  const liveCount = runners.filter((runner) => runner.livePosition !== null).length;

  return (
    <div className={`gpx-map ${ready ? "is-ready" : ""}`} aria-label={`Carte OpenStreetMap du tracé GPX : ${label}`}>
      <div ref={containerRef} className="gpx-map-canvas" />
      {!ready && <div className="gpx-map-loading">Chargement de la carte…</div>}
      {liveCount > 0 && <div className="gpx-live-count"><i /> {liveCount} GPS en direct</div>}
      <a className="gpx-osm-link" href={osmLink} target="_blank" rel="noreferrer">Voir sur OpenStreetMap ↗</a>
    </div>
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character] ?? character);
}
