"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { downloadReceiptCsv } from "@/lib/download-receipt-csv";
import type { ReceiptListFilters } from "@/lib/receipt-filters";

type ReceiptExportState = {
  filters: ReceiptListFilters | null;
  exportAllowed: boolean;
};

type ReceiptExportContextValue = {
  sharedDataEnabled: boolean;
  exportAllowed: boolean;
  isExporting: boolean;
  setExportState: (state: ReceiptExportState) => void;
  downloadCsv: () => Promise<void>;
};

const ReceiptExportContext = createContext<ReceiptExportContextValue | null>(
  null,
);

type ReceiptExportProviderProps = {
  children: ReactNode;
  sharedDataEnabled: boolean;
};

export function ReceiptExportProvider({
  children,
  sharedDataEnabled,
}: ReceiptExportProviderProps) {
  const [filters, setFilters] = useState<ReceiptListFilters | null>(null);
  const [exportAllowed, setExportAllowed] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const setExportState = useCallback((state: ReceiptExportState) => {
    setFilters(state.filters);
    setExportAllowed(state.exportAllowed);
  }, []);

  const downloadCsv = useCallback(async () => {
    if (!filters || !exportAllowed) {
      return;
    }

    setIsExporting(true);

    try {
      await downloadReceiptCsv(filters);
    } finally {
      setIsExporting(false);
    }
  }, [exportAllowed, filters]);

  const value = useMemo(
    () => ({
      sharedDataEnabled,
      exportAllowed: sharedDataEnabled && exportAllowed,
      isExporting,
      setExportState,
      downloadCsv,
    }),
    [downloadCsv, exportAllowed, isExporting, setExportState, sharedDataEnabled],
  );

  return (
    <ReceiptExportContext.Provider value={value}>
      {children}
    </ReceiptExportContext.Provider>
  );
}

export function useReceiptExport() {
  const context = useContext(ReceiptExportContext);

  if (!context) {
    throw new Error("useReceiptExport must be used within ReceiptExportProvider");
  }

  return context;
}
