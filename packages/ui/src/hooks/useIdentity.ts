/**
 * Identity management hook.
 *
 * Fetches the directory to get available addresses,
 * stores the selected identity in React state.
 */
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AddressSummary } from "@inbox/contracts";
import { fetchDirectory } from "../api.js";

export interface Identity {
  address: string;
  setAddress: (addr: string) => void;
  addresses: AddressSummary[];
  isLoading: boolean;
}

export function useIdentity(): Identity {
  const [address, setAddress] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["directory"],
    queryFn: fetchDirectory,
  });

  const addresses = data?.items ?? [];

  // Set default address to first non-list, active address
  useEffect(() => {
    if (!address && addresses.length > 0) {
      const first =
        addresses.find((a) => a.is_active && a.kind !== "list") ??
        addresses[0];
      if (first) setAddress(first.address);
    }
  }, [address, addresses]);

  return { address, setAddress, addresses, isLoading };
}
