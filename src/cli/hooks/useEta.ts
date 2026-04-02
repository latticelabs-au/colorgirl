import { useState, useEffect, useRef } from "react";
import { formatElapsed } from "../utils.js";

interface EtaResult {
  elapsed: number;
  elapsedStr: string;
  etaStr: string;
}

/**
 * Track elapsed time and compute an ETA string based on progress percentage.
 * Shared between ScrapeProgressScreen and EnrichmentScreen.
 */
export function useEta(percentage: number): EtaResult {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)),
      1000,
    );
    return () => clearInterval(t);
  }, []);

  let etaStr = "";
  if (percentage > 5 && elapsed > 5) {
    const totalEstimate = (elapsed / percentage) * 100;
    const remaining = Math.max(0, Math.round(totalEstimate - elapsed));
    const remMins = Math.floor(remaining / 60);
    const remSecs = remaining % 60;
    etaStr =
      remMins > 0 ? `~${remMins}m ${remSecs}s remaining` : `~${remSecs}s remaining`;
  }

  return {
    elapsed,
    elapsedStr: formatElapsed(elapsed),
    etaStr,
  };
}
